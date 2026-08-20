import { supabase } from '../client';

// Singleton per-diagram realtime channel manager. `PresenceAvatars` (header)
// and `SupabaseCanvasSlot` (canvas cursors) both call `acquireChannel` for
// the same `diagramId` and end up sharing one Supabase Realtime channel —
// one websocket "room" per diagram, not one per consumer.
//
// Channels are private (`config.private: true`): the server-side RLS
// policies on `realtime.messages` only allow approved/authenticated users to
// read and write, so every subscribe attempt must carry a fresh JWT via
// `supabase.realtime.setAuth()`. If auth is rejected (e.g. the user's role
// changed, or the token expired) we log a warning and leave the channel
// silently inactive instead of throwing.

type RealtimeChannelInstance = ReturnType<
    NonNullable<typeof supabase>['channel']
>;

export interface PresenceParticipant {
    userId: string;
    email: string;
    color: string;
}

export interface CursorBroadcastPayload {
    userId: string;
    email: string;
    color: string;
    x: number;
    y: number;
    hidden?: boolean;
}

// Shape tracked via `channel.track(...)` for presence.
interface TrackedPresence {
    userId: string;
    email: string;
    color: string;
    joinedAt: number;
}

export interface DiagramChannelHandle {
    // Subscribes to presence changes. Fires immediately with the current
    // snapshot, then again on every join/leave/sync. Returns an unsubscribe
    // function.
    onPresenceChange: (
        cb: (participants: PresenceParticipant[]) => void
    ) => () => void;
    // Subscribes to incoming cursor broadcasts from other participants.
    // Returns an unsubscribe function.
    onCursor: (cb: (payload: CursorBroadcastPayload) => void) => () => void;
    // Sends a cursor broadcast. Callers are responsible for throttling.
    sendCursor: (payload: CursorBroadcastPayload) => void;
    // Live edit operations (see sync/live-ops.ts). Payload is opaque to the
    // channel layer.
    onOp: (cb: (payload: unknown) => void) => () => void;
    sendOp: (payload: unknown) => void;
}

interface ManagedChannel {
    channel: RealtimeChannelInstance;
    refCount: number;
    presenceListeners: Set<(participants: PresenceParticipant[]) => void>;
    cursorListeners: Set<(payload: CursorBroadcastPayload) => void>;
    opListeners: Set<(payload: unknown) => void>;
}

const registry = new Map<string, ManagedChannel>();

// Deterministic per-user color: hash(userId) -> hsl(h, 70%, 45%). Same user
// always renders with the same color across tabs/sessions.
export function colorForUserId(userId: string): string {
    let hash = 0;
    for (let i = 0; i < userId.length; i += 1) {
        hash = (hash << 5) - hash + userId.charCodeAt(i);
        hash |= 0;
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 45%)`;
}

function emitPresence(managed: ManagedChannel): void {
    if (managed.presenceListeners.size === 0) {
        return;
    }

    const state = managed.channel.presenceState<TrackedPresence>();
    const participants: PresenceParticipant[] = [];

    Object.values(state).forEach((entries) => {
        // Same user can be tracked twice under the same presence key (e.g.
        // two open tabs) — only the first entry is surfaced so one user
        // never counts as two participants.
        const entry = entries[0];
        if (!entry) {
            return;
        }
        participants.push({
            userId: entry.userId,
            email: entry.email,
            color: entry.color,
        });
    });

    managed.presenceListeners.forEach((listener) => listener(participants));
}

function toHandle(managed: ManagedChannel): DiagramChannelHandle {
    return {
        onPresenceChange(cb) {
            managed.presenceListeners.add(cb);
            emitPresence(managed);
            return () => {
                managed.presenceListeners.delete(cb);
            };
        },
        onCursor(cb) {
            managed.cursorListeners.add(cb);
            return () => {
                managed.cursorListeners.delete(cb);
            };
        },
        sendCursor(payload) {
            managed.channel
                .send({ type: 'broadcast', event: 'cursor', payload })
                .catch(() => {
                    // Best effort — a dropped cursor update is invisible to
                    // the user, no need to surface it.
                });
        },
        onOp(cb) {
            managed.opListeners.add(cb);
            return () => {
                managed.opListeners.delete(cb);
            };
        },
        sendOp(payload) {
            managed.channel
                .send({ type: 'broadcast', event: 'op', payload })
                .catch(() => {
                    // Best effort — the blob sync will still converge the
                    // documents even if a live op is dropped.
                });
        },
    };
}

// Returns a handle to an ALREADY-ACQUIRED channel without touching the
// refcount, or null if nobody holds one for this diagram. Used by the
// storage bridge to broadcast live ops: the channel exists exactly while
// the diagram's canvas is open (acquired by cursors/avatars).
export function peekChannel(diagramId: string): DiagramChannelHandle | null {
    const managed = registry.get(diagramId);
    return managed ? toHandle(managed) : null;
}

// Creates (or reuses) the shared realtime channel for `diagramId` and bumps
// its refcount. Returns null when Supabase isn't configured. Pair every
// call with `releaseChannel(diagramId)` on cleanup.
export function acquireChannel(
    diagramId: string,
    user: { id: string; email: string }
): DiagramChannelHandle | null {
    if (!supabase) {
        return null;
    }

    const existing = registry.get(diagramId);
    if (existing) {
        existing.refCount += 1;
        return toHandle(existing);
    }

    const color = colorForUserId(user.id);
    const channel = supabase.channel(`diagram:${diagramId}`, {
        config: { private: true, presence: { key: user.id } },
    });

    const managed: ManagedChannel = {
        channel,
        refCount: 1,
        presenceListeners: new Set(),
        cursorListeners: new Set(),
        opListeners: new Set(),
    };
    registry.set(diagramId, managed);

    channel
        .on('presence', { event: 'sync' }, () => emitPresence(managed))
        .on<CursorBroadcastPayload>(
            'broadcast',
            { event: 'cursor' },
            ({ payload }) => {
                managed.cursorListeners.forEach((listener) =>
                    listener(payload)
                );
            }
        )
        .on('broadcast', { event: 'op' }, ({ payload }) => {
            managed.opListeners.forEach((listener) => listener(payload));
        });

    const client = supabase;
    // Private channels need a fresh JWT handed to the realtime socket
    // before subscribing. Newer supabase-js versions do this automatically
    // on connect, but we set it explicitly to be safe across versions.
    void client.realtime
        .setAuth()
        .catch((error) => {
            console.warn(
                '[supabase/realtime] failed to refresh realtime auth token',
                error
            );
        })
        .finally(() => {
            // The channel may have been released while setAuth was in
            // flight (e.g. React StrictMode's mount→cleanup→mount cycle in
            // dev, or fast navigation between diagrams). Subscribing a
            // removed channel would race a fresh channel with the same
            // topic on the shared socket — skip if we're no longer current.
            if (registry.get(diagramId) !== managed) {
                return;
            }
            channel.subscribe(async (subscribeStatus, error) => {
                if (subscribeStatus === 'SUBSCRIBED') {
                    try {
                        await channel.track({
                            userId: user.id,
                            email: user.email,
                            color,
                            joinedAt: Date.now(),
                        } satisfies TrackedPresence);
                    } catch (trackError) {
                        console.warn(
                            '[supabase/realtime] failed to track presence',
                            trackError
                        );
                    }
                } else if (
                    subscribeStatus === 'CHANNEL_ERROR' ||
                    subscribeStatus === 'TIMED_OUT'
                ) {
                    // Typically an authorization failure (e.g. RLS denied
                    // the private channel). Fail silently — no presence /
                    // cursors for this session, but the rest of the app
                    // keeps working.
                    console.warn(
                        '[supabase/realtime] channel subscription failed',
                        diagramId,
                        subscribeStatus,
                        error
                    );
                }
            });
        });

    return toHandle(managed);
}

// Decrements the refcount for `diagramId`; once it drops to zero the
// channel is unsubscribed and removed from the client.
export function releaseChannel(diagramId: string): void {
    const managed = registry.get(diagramId);
    if (!managed) {
        return;
    }

    managed.refCount -= 1;
    if (managed.refCount > 0) {
        return;
    }

    registry.delete(diagramId);
    managed.presenceListeners.clear();
    managed.cursorListeners.clear();
    managed.opListeners.clear();

    if (supabase) {
        void supabase.removeChannel(managed.channel);
    }
}
