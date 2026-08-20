import type { StorageContext } from '@/context/storage-context/storage-context';
import type { Diagram } from '@/lib/domain/diagram';
import { diagramFromContent, diagramToContent } from './serialize';
import { supabase } from '../client';
import type { SyncStatus } from '../types';

const PUSH_DEBOUNCE_MS = 2000;

// Full diagram, including every nested entity — what gets serialized into
// the single JSON blob we push to Supabase.
const FULL_DIAGRAM_OPTIONS = {
    includeTables: true,
    includeRelationships: true,
    includeDependencies: true,
    includeAreas: true,
    includeCustomTypes: true,
    includeNotes: true,
} as const;

interface DiagramRow {
    id: string;
    name: string;
    updated_at: string;
}

interface DiagramContentRow {
    id: string;
    content: unknown;
    updated_at: string;
}

export interface DiagramSyncEngineOptions {
    storage: StorageContext;
    ownerId: string;
    onStatusChange?: (status: SyncStatus, lastSyncedAt: Date | null) => void;
}

export interface DiagramSyncEngine {
    // Serializes the diagram and upserts it to Supabase right away.
    pushDiagram: (diagramId: string) => Promise<void>;
    // Debounced (2s, per-diagram) call to pushDiagram — repeated calls reset
    // the timer.
    schedulePush: (diagramId: string) => void;
    // Deletes the remote row immediately (used after a local delete).
    deleteRemote: (diagramId: string) => Promise<void>;
    // Pulls the list of remote diagrams, compares updatedAt against local
    // storage and reconciles in both directions (last-write-wins).
    pullAll: () => Promise<void>;
    // Clears pending timers and event listeners.
    destroy: () => void;
}

const isOffline = (): boolean =>
    typeof navigator !== 'undefined' &&
    'onLine' in navigator &&
    navigator.onLine === false;

export function createDiagramSyncEngine({
    storage,
    ownerId,
    onStatusChange,
}: DiagramSyncEngineOptions): DiagramSyncEngine {
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const dirtyDiagramIds = new Set<string>();
    let lastSyncedAt: Date | null = null;
    let destroyed = false;

    // Deletes that failed to reach Supabase (e.g. offline) are persisted so
    // the next pullAll does not resurrect the diagram from the remote copy.
    const pendingDeletesKey = `chartdb_supabase_pending_deletes:${ownerId}`;
    const loadPendingDeletes = (): Set<string> => {
        try {
            const raw = window.localStorage.getItem(pendingDeletesKey);
            return new Set(raw ? (JSON.parse(raw) as string[]) : []);
        } catch {
            return new Set();
        }
    };
    const pendingDeletes = loadPendingDeletes();
    const persistPendingDeletes = (): void => {
        try {
            if (pendingDeletes.size === 0) {
                window.localStorage.removeItem(pendingDeletesKey);
            } else {
                window.localStorage.setItem(
                    pendingDeletesKey,
                    JSON.stringify(Array.from(pendingDeletes))
                );
            }
        } catch {
            // localStorage unavailable — deletes will only be retried
            // within this session.
        }
    };

    const setStatus = (status: SyncStatus): void => {
        if (status === 'idle') {
            lastSyncedAt = new Date();
        }
        onStatusChange?.(status, lastSyncedAt);
    };

    const pushDiagram = async (diagramId: string): Promise<void> => {
        if (!supabase || destroyed) return;

        const diagram = await storage.getDiagram(
            diagramId,
            FULL_DIAGRAM_OPTIONS
        );

        // The diagram was deleted locally in the meantime — nothing to push.
        if (!diagram) {
            dirtyDiagramIds.delete(diagramId);
            return;
        }

        setStatus('syncing');
        try {
            const content = diagramToContent(diagram);
            const { error } = await supabase.from('diagrams').upsert({
                id: diagram.id,
                owner_id: ownerId,
                name: diagram.name,
                content,
                updated_at: diagram.updatedAt.toISOString(),
            });

            if (error) throw error;

            dirtyDiagramIds.delete(diagramId);
            setStatus('idle');
        } catch {
            dirtyDiagramIds.add(diagramId);
            setStatus(isOffline() ? 'offline' : 'error');
        }
    };

    const schedulePush = (diagramId: string): void => {
        if (!supabase || destroyed) return;

        const existingTimer = timers.get(diagramId);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        const timer = setTimeout(() => {
            timers.delete(diagramId);
            void pushDiagram(diagramId);
        }, PUSH_DEBOUNCE_MS);

        timers.set(diagramId, timer);
    };

    const deleteRemote = async (diagramId: string): Promise<void> => {
        if (!supabase || destroyed) return;

        const existingTimer = timers.get(diagramId);
        if (existingTimer) {
            clearTimeout(existingTimer);
            timers.delete(diagramId);
        }
        dirtyDiagramIds.delete(diagramId);

        try {
            const { error } = await supabase
                .from('diagrams')
                .delete()
                .eq('id', diagramId)
                .eq('owner_id', ownerId);

            if (error) throw error;

            pendingDeletes.delete(diagramId);
            persistPendingDeletes();
        } catch {
            // The local copy is already gone; remember the failed remote
            // delete so pullAll does not resurrect the diagram and retry
            // it when we are back online.
            pendingDeletes.add(diagramId);
            persistPendingDeletes();
        }
    };

    const flushPendingDeletes = async (): Promise<void> => {
        for (const diagramId of Array.from(pendingDeletes)) {
            await deleteRemote(diagramId);
        }
    };

    // Overwrites the local diagram (and every nested entity) with the
    // content of a remote row.
    const applyRemoteDiagram = async (
        row: DiagramContentRow
    ): Promise<void> => {
        const parsed = diagramFromContent(row.content);

        const diagram: Diagram = {
            ...parsed,
            id: row.id,
            updatedAt: new Date(row.updated_at),
        };

        await Promise.all([
            storage.deleteDiagramTables(diagram.id),
            storage.deleteDiagramRelationships(diagram.id),
            storage.deleteDiagramDependencies(diagram.id),
            storage.deleteDiagramAreas(diagram.id),
            storage.deleteDiagramCustomTypes(diagram.id),
            storage.deleteDiagramNotes(diagram.id),
        ]);
        await storage.deleteDiagram(diagram.id);
        await storage.addDiagram({ diagram });
    };

    const pullAll = async (): Promise<void> => {
        if (!supabase) return;

        setStatus('syncing');
        try {
            // Finish deletes that failed earlier before reconciling, so the
            // corresponding remote rows are gone by the time we compare.
            await flushPendingDeletes();

            const { data: remoteRows, error } = await supabase
                .from('diagrams')
                .select('id, name, updated_at')
                .eq('owner_id', ownerId)
                .returns<DiagramRow[]>();

            if (error) throw error;

            const localDiagrams = await storage.listDiagrams();
            const localById = new Map(localDiagrams.map((d) => [d.id, d]));
            const remoteById = new Map(
                (remoteRows ?? []).map((row) => [row.id, row])
            );

            // Remote is newer or missing locally -> pull it in.
            for (const row of remoteRows ?? []) {
                // Deleted locally, remote delete still pending — skip.
                if (pendingDeletes.has(row.id)) continue;

                const local = localById.get(row.id);
                const remoteUpdatedAt = new Date(row.updated_at).getTime();

                if (!local || remoteUpdatedAt > local.updatedAt.getTime()) {
                    const { data: fullRow, error: fetchError } = await supabase
                        .from('diagrams')
                        .select('id, content, updated_at')
                        .eq('id', row.id)
                        .single();

                    if (fetchError || !fullRow) continue;

                    await applyRemoteDiagram(fullRow as DiagramContentRow);
                }
            }

            // Local is newer or missing remotely -> push it out (no need to
            // debounce here, this only runs once on mount/user change).
            for (const diagram of localDiagrams) {
                const row = remoteById.get(diagram.id);
                const remoteUpdatedAt = row
                    ? new Date(row.updated_at).getTime()
                    : 0;

                if (!row || diagram.updatedAt.getTime() > remoteUpdatedAt) {
                    await pushDiagram(diagram.id);
                }
            }

            setStatus('idle');
        } catch {
            setStatus(isOffline() ? 'offline' : 'error');
        }
    };

    const handleOnline = (): void => {
        void flushPendingDeletes();

        for (const diagramId of Array.from(dirtyDiagramIds)) {
            void pushDiagram(diagramId);
        }
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('online', handleOnline);
    }

    const destroy = (): void => {
        destroyed = true;
        for (const timer of timers.values()) {
            clearTimeout(timer);
        }
        timers.clear();

        if (typeof window !== 'undefined') {
            window.removeEventListener('online', handleOnline);
        }
    };

    return {
        pushDiagram,
        schedulePush,
        deleteRemote,
        pullAll,
        destroy,
    };
}
