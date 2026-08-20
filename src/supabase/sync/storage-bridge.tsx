import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { StorageContext } from '@/context/storage-context/storage-context';
import { storageContext } from '@/context/storage-context/storage-context';
import { useStorage } from '@/hooks/use-storage';
import { Spinner } from '@/components/spinner/spinner';
import { useAuth } from '../auth/auth-context';
import { isSupabaseEnabled } from '../client';
import type { DiagramSyncEngine } from './diagram-sync';
import { createDiagramSyncEngine } from './diagram-sync';
import type { SyncContextValue } from './sync-context';
import { syncContext, syncInitialValue } from './sync-context';

// Tracks which diagram an entity (table/relationship/.../note) belongs to,
// so update*(...) calls — which only receive an entity id — can resolve the
// diagramId to push. Populated from every call that carries both ids.
function rememberEntity(
    entityDiagramMap: Map<string, string>,
    lastDiagramIdRef: React.MutableRefObject<string | null>,
    entityId: string | undefined | null,
    diagramId: string | undefined | null
): void {
    if (entityId && diagramId) {
        entityDiagramMap.set(entityId, diagramId);
    }
    if (diagramId) {
        lastDiagramIdRef.current = diagramId;
    }
}

function resolveDiagramIdForEntity(
    entityDiagramMap: Map<string, string>,
    lastDiagramIdRef: React.MutableRefObject<string | null>,
    entityId: string
): string | undefined {
    return (
        entityDiagramMap.get(entityId) ?? lastDiagramIdRef.current ?? undefined
    );
}

function forgetDiagram(
    entityDiagramMap: Map<string, string>,
    lastDiagramIdRef: React.MutableRefObject<string | null>,
    diagramId: string
): void {
    for (const [entityId, ownerDiagramId] of entityDiagramMap) {
        if (ownerDiagramId === diagramId) {
            entityDiagramMap.delete(entityId);
        }
    }
    if (lastDiagramIdRef.current === diagramId) {
        lastDiagramIdRef.current = null;
    }
}

// Wraps a StorageContext implementation so every mutating diagram-entity
// call schedules a debounced push of its owning diagram to Supabase after
// it succeeds locally. Config and diagram-filter operations are local-only
// and are passed through untouched.
function wrapStorageWithSync(
    storage: StorageContext,
    engineRef: React.MutableRefObject<DiagramSyncEngine | null>,
    entityDiagramMap: Map<string, string>,
    lastDiagramIdRef: React.MutableRefObject<string | null>
): StorageContext {
    const pushDiagram = (diagramId: string | undefined | null): void => {
        if (diagramId) {
            engineRef.current?.schedulePush(diagramId);
        }
    };

    return {
        // Config — local only, not synced.
        getConfig: storage.getConfig,
        updateConfig: storage.updateConfig,

        // Diagram filter — local only, not synced.
        getDiagramFilter: storage.getDiagramFilter,
        updateDiagramFilter: storage.updateDiagramFilter,
        deleteDiagramFilter: storage.deleteDiagramFilter,

        // Diagram
        addDiagram: async (params) => {
            await storage.addDiagram(params);
            lastDiagramIdRef.current = params.diagram.id;
            pushDiagram(params.diagram.id);
        },
        listDiagrams: storage.listDiagrams,
        getDiagram: async (id, options) => {
            const result = await storage.getDiagram(id, options);
            lastDiagramIdRef.current = id;
            return result;
        },
        updateDiagram: async (params) => {
            await storage.updateDiagram(params);
            pushDiagram(params.id);
        },
        deleteDiagram: async (id) => {
            await storage.deleteDiagram(id);
            forgetDiagram(entityDiagramMap, lastDiagramIdRef, id);
            void engineRef.current?.deleteRemote(id);
        },

        // Table
        addTable: async (params) => {
            await storage.addTable(params);
            rememberEntity(
                entityDiagramMap,
                lastDiagramIdRef,
                params.table.id,
                params.diagramId
            );
            pushDiagram(params.diagramId);
        },
        getTable: async (params) => {
            const result = await storage.getTable(params);
            rememberEntity(
                entityDiagramMap,
                lastDiagramIdRef,
                params.id,
                params.diagramId
            );
            return result;
        },
        updateTable: async (params) => {
            await storage.updateTable(params);
            pushDiagram(
                resolveDiagramIdForEntity(
                    entityDiagramMap,
                    lastDiagramIdRef,
                    params.id
                )
            );
        },
        putTable: async (params) => {
            await storage.putTable(params);
            rememberEntity(
                entityDiagramMap,
                lastDiagramIdRef,
                params.table.id,
                params.diagramId
            );
            pushDiagram(params.diagramId);
        },
        deleteTable: async (params) => {
            await storage.deleteTable(params);
            pushDiagram(params.diagramId);
        },
        listTables: async (diagramId) => {
            const result = await storage.listTables(diagramId);
            result.forEach((table) =>
                rememberEntity(
                    entityDiagramMap,
                    lastDiagramIdRef,
                    table.id,
                    diagramId
                )
            );
            return result;
        },
        deleteDiagramTables: async (diagramId) => {
            await storage.deleteDiagramTables(diagramId);
            pushDiagram(diagramId);
        },

        // Relationships
        addRelationship: async (params) => {
            await storage.addRelationship(params);
            rememberEntity(
                entityDiagramMap,
                lastDiagramIdRef,
                params.relationship.id,
                params.diagramId
            );
            pushDiagram(params.diagramId);
        },
        getRelationship: async (params) => {
            const result = await storage.getRelationship(params);
            rememberEntity(
                entityDiagramMap,
                lastDiagramIdRef,
                params.id,
                params.diagramId
            );
            return result;
        },
        updateRelationship: async (params) => {
            await storage.updateRelationship(params);
            pushDiagram(
                resolveDiagramIdForEntity(
                    entityDiagramMap,
                    lastDiagramIdRef,
                    params.id
                )
            );
        },
        deleteRelationship: async (params) => {
            await storage.deleteRelationship(params);
            pushDiagram(params.diagramId);
        },
        listRelationships: async (diagramId) => {
            const result = await storage.listRelationships(diagramId);
            result.forEach((relationship) =>
                rememberEntity(
                    entityDiagramMap,
                    lastDiagramIdRef,
                    relationship.id,
                    diagramId
                )
            );
            return result;
        },
        deleteDiagramRelationships: async (diagramId) => {
            await storage.deleteDiagramRelationships(diagramId);
            pushDiagram(diagramId);
        },

        // Dependencies
        addDependency: async (params) => {
            await storage.addDependency(params);
            rememberEntity(
                entityDiagramMap,
                lastDiagramIdRef,
                params.dependency.id,
                params.diagramId
            );
            pushDiagram(params.diagramId);
        },
        getDependency: async (params) => {
            const result = await storage.getDependency(params);
            rememberEntity(
                entityDiagramMap,
                lastDiagramIdRef,
                params.id,
                params.diagramId
            );
            return result;
        },
        updateDependency: async (params) => {
            await storage.updateDependency(params);
            pushDiagram(
                resolveDiagramIdForEntity(
                    entityDiagramMap,
                    lastDiagramIdRef,
                    params.id
                )
            );
        },
        deleteDependency: async (params) => {
            await storage.deleteDependency(params);
            pushDiagram(params.diagramId);
        },
        listDependencies: async (diagramId) => {
            const result = await storage.listDependencies(diagramId);
            result.forEach((dependency) =>
                rememberEntity(
                    entityDiagramMap,
                    lastDiagramIdRef,
                    dependency.id,
                    diagramId
                )
            );
            return result;
        },
        deleteDiagramDependencies: async (diagramId) => {
            await storage.deleteDiagramDependencies(diagramId);
            pushDiagram(diagramId);
        },

        // Areas
        addArea: async (params) => {
            await storage.addArea(params);
            rememberEntity(
                entityDiagramMap,
                lastDiagramIdRef,
                params.area.id,
                params.diagramId
            );
            pushDiagram(params.diagramId);
        },
        getArea: async (params) => {
            const result = await storage.getArea(params);
            rememberEntity(
                entityDiagramMap,
                lastDiagramIdRef,
                params.id,
                params.diagramId
            );
            return result;
        },
        updateArea: async (params) => {
            await storage.updateArea(params);
            pushDiagram(
                resolveDiagramIdForEntity(
                    entityDiagramMap,
                    lastDiagramIdRef,
                    params.id
                )
            );
        },
        deleteArea: async (params) => {
            await storage.deleteArea(params);
            pushDiagram(params.diagramId);
        },
        listAreas: async (diagramId) => {
            const result = await storage.listAreas(diagramId);
            result.forEach((area) =>
                rememberEntity(
                    entityDiagramMap,
                    lastDiagramIdRef,
                    area.id,
                    diagramId
                )
            );
            return result;
        },
        deleteDiagramAreas: async (diagramId) => {
            await storage.deleteDiagramAreas(diagramId);
            pushDiagram(diagramId);
        },

        // Custom types
        addCustomType: async (params) => {
            await storage.addCustomType(params);
            rememberEntity(
                entityDiagramMap,
                lastDiagramIdRef,
                params.customType.id,
                params.diagramId
            );
            pushDiagram(params.diagramId);
        },
        getCustomType: async (params) => {
            const result = await storage.getCustomType(params);
            rememberEntity(
                entityDiagramMap,
                lastDiagramIdRef,
                params.id,
                params.diagramId
            );
            return result;
        },
        updateCustomType: async (params) => {
            await storage.updateCustomType(params);
            pushDiagram(
                resolveDiagramIdForEntity(
                    entityDiagramMap,
                    lastDiagramIdRef,
                    params.id
                )
            );
        },
        deleteCustomType: async (params) => {
            await storage.deleteCustomType(params);
            pushDiagram(params.diagramId);
        },
        listCustomTypes: async (diagramId) => {
            const result = await storage.listCustomTypes(diagramId);
            result.forEach((customType) =>
                rememberEntity(
                    entityDiagramMap,
                    lastDiagramIdRef,
                    customType.id,
                    diagramId
                )
            );
            return result;
        },
        deleteDiagramCustomTypes: async (diagramId) => {
            await storage.deleteDiagramCustomTypes(diagramId);
            pushDiagram(diagramId);
        },

        // Notes
        addNote: async (params) => {
            await storage.addNote(params);
            rememberEntity(
                entityDiagramMap,
                lastDiagramIdRef,
                params.note.id,
                params.diagramId
            );
            pushDiagram(params.diagramId);
        },
        getNote: async (params) => {
            const result = await storage.getNote(params);
            rememberEntity(
                entityDiagramMap,
                lastDiagramIdRef,
                params.id,
                params.diagramId
            );
            return result;
        },
        updateNote: async (params) => {
            await storage.updateNote(params);
            pushDiagram(
                resolveDiagramIdForEntity(
                    entityDiagramMap,
                    lastDiagramIdRef,
                    params.id
                )
            );
        },
        deleteNote: async (params) => {
            await storage.deleteNote(params);
            pushDiagram(params.diagramId);
        },
        listNotes: async (diagramId) => {
            const result = await storage.listNotes(diagramId);
            result.forEach((note) =>
                rememberEntity(
                    entityDiagramMap,
                    lastDiagramIdRef,
                    note.id,
                    diagramId
                )
            );
            return result;
        },
        deleteDiagramNotes: async (diagramId) => {
            await storage.deleteDiagramNotes(diagramId);
            pushDiagram(diagramId);
        },
    };
}

// Wraps the local (Dexie) storage context: intercepts mutating diagram
// operations to schedule a debounced push to Supabase, and pulls the full
// diagram set from Supabase on mount / user change before rendering
// children — so whatever loads diagrams next sees already-synced data.
// The original StorageProvider is left untouched; this simply re-provides
// storageContext further down the tree.
export const SupabaseStorageBridge: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const storage = useStorage();
    const { status: authStatus, user } = useAuth();

    const active = isSupabaseEnabled && authStatus === 'approved' && !!user;

    const engineRef = useRef<DiagramSyncEngine | null>(null);
    const entityDiagramMapRef = useRef<Map<string, string>>(new Map());
    const lastDiagramIdRef = useRef<string | null>(null);

    const [syncState, setSyncState] =
        useState<SyncContextValue>(syncInitialValue);
    const [initialPullDone, setInitialPullDone] = useState(false);

    const ownerId = user?.id;

    useEffect(() => {
        if (!active || !ownerId) {
            return;
        }

        setInitialPullDone(false);
        entityDiagramMapRef.current = new Map();
        lastDiagramIdRef.current = null;

        const engine = createDiagramSyncEngine({
            storage,
            ownerId,
            onStatusChange: (status, lastSyncedAt) => {
                setSyncState({ status, lastSyncedAt });
            },
        });
        engineRef.current = engine;

        let cancelled = false;
        void engine.pullAll().finally(() => {
            if (!cancelled) {
                setInitialPullDone(true);
            }
        });

        return () => {
            cancelled = true;
            engine.destroy();
            engineRef.current = null;
        };
    }, [active, ownerId, storage]);

    const wrapped = useMemo(
        () =>
            wrapStorageWithSync(
                storage,
                engineRef,
                entityDiagramMapRef.current,
                lastDiagramIdRef
            ),
        [storage]
    );

    if (!active) {
        return <>{children}</>;
    }

    if (!initialPullDone) {
        return (
            <div className="flex size-full h-screen items-center justify-center">
                <Spinner size="large" />
            </div>
        );
    }

    return (
        <syncContext.Provider value={syncState}>
            <storageContext.Provider value={wrapped}>
                {children}
            </storageContext.Provider>
        </syncContext.Provider>
    );
};
