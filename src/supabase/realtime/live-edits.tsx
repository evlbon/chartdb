import type React from 'react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/auth-context';
import { useChartDB } from '@/hooks/use-chartdb';
import { useToast } from '@/components/toast/use-toast';
import { acquireChannel, releaseChannel } from './channel';
import { TAB_CLIENT_ID, runWithRemoteApply } from '../sync/live-ops';
import type { LiveOp } from '../sync/live-ops';
import type { ChartDBContext } from '@/context/chartdb-context/chartdb-context';

// Applies live edit operations broadcast by other participants (see
// ../sync/storage-bridge.tsx, the author side) to this tab's open editor —
// the receiving half of the live-edits feature. Renders nothing; purely a
// side-effect component gated the same way as `SupabaseCanvasSlot`.
//
// Shares the per-diagram realtime channel with cursors/presence via the
// channel manager (./channel.ts) — its own acquire/release pair, refcounted
// independently.

interface Latest {
    chartDB: ChartDBContext;
    toast: ReturnType<typeof useToast>['toast'];
    navigate: ReturnType<typeof useNavigate>;
}

export const LiveEdits: React.FC = () => {
    const { status, user } = useAuth();
    const chartDB = useChartDB();
    const { toast } = useToast();
    const navigate = useNavigate();
    const { diagramId } = chartDB;

    const active = status === 'approved' && !!user && !!diagramId;
    const userId = user?.id;
    const userEmail = user?.email;

    // Kept up to date every render so the op handler (bound once per channel
    // acquisition, see the effect below) always reads the latest ChartDB
    // actions/state, toast and navigate without forcing a resubscribe every
    // time one of them changes identity (mirrors `screenToFlowPositionRef`
    // in ./canvas-slot.tsx).
    const latestRef = useRef<Latest>({ chartDB, toast, navigate });
    useEffect(() => {
        latestRef.current = { chartDB, toast, navigate };
    });

    // Serializes op application so concurrent broadcasts are applied one at
    // a time, in arrival order, instead of racing each other. Persists for
    // the component's lifetime — outlives individual channel acquisitions.
    const queueRef = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        if (!active || !userId) {
            return;
        }

        const email = userEmail ?? '';
        const handle = acquireChannel(diagramId, { id: userId, email });
        if (!handle) {
            return;
        }

        const applyOp = async (op: LiveOp): Promise<void> => {
            const {
                chartDB: cdb,
                toast: showToast,
                navigate: nav,
            } = latestRef.current;

            try {
                await runWithRemoteApply(async () => {
                    switch (op.type) {
                        case 'updateDiagram': {
                            if (op.attributes.name !== undefined) {
                                await cdb.updateDiagramName(
                                    op.attributes.name,
                                    { updateHistory: false }
                                );
                            }
                            // Other diagram attributes (databaseType, etc.)
                            // change rarely and are left to the blob sync to
                            // converge.
                            break;
                        }
                        case 'deleteDiagram': {
                            // Already deleted on the author's side — do not
                            // call chartDB's delete again, just get the user
                            // out of the now-gone diagram.
                            showToast({
                                title: 'Diagram was deleted on another device',
                                variant: 'destructive',
                            });
                            nav('/');
                            break;
                        }
                        case 'addTable':
                            await cdb.addTable(op.table, {
                                updateHistory: false,
                            });
                            break;
                        case 'putTable': {
                            const exists = cdb.tables.some(
                                (table) => table.id === op.table.id
                            );
                            if (exists) {
                                await cdb.updateTable(op.table.id, op.table, {
                                    updateHistory: false,
                                });
                            } else {
                                await cdb.addTable(op.table, {
                                    updateHistory: false,
                                });
                            }
                            break;
                        }
                        case 'updateTable':
                            await cdb.updateTable(op.id, op.attributes, {
                                updateHistory: false,
                            });
                            break;
                        case 'deleteTable':
                            await cdb.removeTable(op.id, {
                                updateHistory: false,
                            });
                            break;
                        case 'deleteDiagramTables':
                            await cdb.removeTables(
                                cdb.tables.map((table) => table.id),
                                { updateHistory: false }
                            );
                            break;
                        case 'addRelationship':
                            await cdb.addRelationship(op.relationship, {
                                updateHistory: false,
                            });
                            break;
                        case 'updateRelationship':
                            await cdb.updateRelationship(op.id, op.attributes, {
                                updateHistory: false,
                            });
                            break;
                        case 'deleteRelationship':
                            await cdb.removeRelationship(op.id, {
                                updateHistory: false,
                            });
                            break;
                        case 'deleteDiagramRelationships':
                            await cdb.removeRelationships(
                                cdb.relationships.map(
                                    (relationship) => relationship.id
                                ),
                                { updateHistory: false }
                            );
                            break;
                        case 'addDependency':
                            await cdb.addDependency(op.dependency, {
                                updateHistory: false,
                            });
                            break;
                        case 'updateDependency':
                            await cdb.updateDependency(op.id, op.attributes, {
                                updateHistory: false,
                            });
                            break;
                        case 'deleteDependency':
                            await cdb.removeDependency(op.id, {
                                updateHistory: false,
                            });
                            break;
                        case 'deleteDiagramDependencies':
                            await cdb.removeDependencies(
                                cdb.dependencies.map(
                                    (dependency) => dependency.id
                                ),
                                { updateHistory: false }
                            );
                            break;
                        case 'addArea':
                            await cdb.addArea(op.area, {
                                updateHistory: false,
                            });
                            break;
                        case 'updateArea':
                            await cdb.updateArea(op.id, op.attributes, {
                                updateHistory: false,
                            });
                            break;
                        case 'deleteArea':
                            await cdb.removeArea(op.id, {
                                updateHistory: false,
                            });
                            break;
                        case 'deleteDiagramAreas':
                            await cdb.removeAreas(
                                cdb.areas.map((area) => area.id),
                                { updateHistory: false }
                            );
                            break;
                        case 'addCustomType':
                            await cdb.addCustomType(op.customType, {
                                updateHistory: false,
                            });
                            break;
                        case 'updateCustomType':
                            await cdb.updateCustomType(op.id, op.attributes, {
                                updateHistory: false,
                            });
                            break;
                        case 'deleteCustomType':
                            await cdb.removeCustomType(op.id, {
                                updateHistory: false,
                            });
                            break;
                        case 'deleteDiagramCustomTypes':
                            await cdb.removeCustomTypes(
                                cdb.customTypes.map(
                                    (customType) => customType.id
                                ),
                                { updateHistory: false }
                            );
                            break;
                        case 'addNote':
                            await cdb.addNote(op.note, {
                                updateHistory: false,
                            });
                            break;
                        case 'updateNote':
                            await cdb.updateNote(op.id, op.attributes, {
                                updateHistory: false,
                            });
                            break;
                        case 'deleteNote':
                            await cdb.removeNote(op.id, {
                                updateHistory: false,
                            });
                            break;
                        case 'deleteDiagramNotes':
                            await cdb.removeNotes(
                                cdb.notes.map((note) => note.id),
                                { updateHistory: false }
                            );
                            break;
                    }
                });
            } catch (error) {
                console.warn(
                    '[supabase/realtime] failed to apply live op',
                    op,
                    error
                );
            }
        };

        const unsubscribeOp = handle.onOp((payload) => {
            const op = payload as LiveOp;

            if (op.clientId === TAB_CLIENT_ID || op.diagramId !== diagramId) {
                return;
            }

            // Chain onto the queue regardless of outcome — `applyOp` never
            // rejects (errors are caught internally), so the chain can never
            // get stuck.
            queueRef.current = queueRef.current.then(() => applyOp(op));
        });

        return () => {
            unsubscribeOp();
            releaseChannel(diagramId);
        };
        // `toast`/`navigate`/ChartDB actions are read via `latestRef` above
        // so they never have to be dependencies here — only identity
        // changes of the diagram/user should trigger a resubscribe.
    }, [active, diagramId, userId, userEmail]);

    return null;
};
