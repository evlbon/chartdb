import { useEffect, useState } from 'react';
import { useAuth } from '../auth/auth-context';
import { acquireChannel, releaseChannel } from './channel';
import type { PresenceParticipant } from './channel';

export interface DiagramPresenceParticipant {
    userId: string;
    email: string;
    color: string;
}

export interface UseDiagramPresenceResult {
    // Everyone currently viewing the diagram, excluding the current user.
    // Deduplicated by userId (the same person open in two tabs counts once).
    others: DiagramPresenceParticipant[];
}

// Live "who's viewing this diagram" list. Gated on `status === 'approved'`
// and a non-empty `diagramId`; acquires/releases the shared realtime
// channel for that diagram via the channel manager, so this hook can be
// mounted alongside `SupabaseCanvasSlot` without opening a second
// websocket room.
export function useDiagramPresence(
    diagramId: string | undefined
): UseDiagramPresenceResult {
    const { status, user } = useAuth();
    const [others, setOthers] = useState<DiagramPresenceParticipant[]>([]);

    const userId = user?.id;
    const userEmail = user?.email;

    useEffect(() => {
        if (status !== 'approved' || !diagramId || !userId) {
            setOthers([]);
            return;
        }

        const handle = acquireChannel(diagramId, {
            id: userId,
            email: userEmail ?? '',
        });
        if (!handle) {
            setOthers([]);
            return;
        }

        const unsubscribe = handle.onPresenceChange(
            (participants: PresenceParticipant[]) => {
                const deduped = new Map<string, DiagramPresenceParticipant>();
                participants.forEach((participant) => {
                    if (participant.userId === userId) {
                        return;
                    }
                    deduped.set(participant.userId, participant);
                });
                setOthers(Array.from(deduped.values()));
            }
        );

        return () => {
            unsubscribe();
            releaseChannel(diagramId);
        };
    }, [diagramId, status, userId, userEmail]);

    return { others };
}
