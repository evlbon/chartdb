import React, { useEffect, useRef, useState } from 'react';
import { useReactFlow, ViewportPortal } from '@xyflow/react';
import { useAuth } from '../auth/auth-context';
import { useChartDB } from '@/hooks/use-chartdb';
import { acquireChannel, colorForUserId, releaseChannel } from './channel';
import type { CursorBroadcastPayload } from './channel';
import { LiveEdits } from './live-edits';

// Trailing-edge throttle: `fn` is invoked at most once per `waitMs`, always
// with the most recent arguments (so the final cursor position before the
// window closes is never dropped).
function createTrailingThrottle<Args extends unknown[]>(
    fn: (...args: Args) => void,
    waitMs: number
): { call: (...args: Args) => void; cancel: () => void } {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pendingArgs: Args | null = null;
    let lastInvokedAt = 0;

    const flush = (): void => {
        timer = null;
        if (pendingArgs) {
            const args = pendingArgs;
            pendingArgs = null;
            lastInvokedAt = Date.now();
            fn(...args);
        }
    };

    return {
        call: (...args: Args) => {
            pendingArgs = args;
            const elapsed = Date.now() - lastInvokedAt;
            if (elapsed >= waitMs) {
                if (timer) {
                    clearTimeout(timer);
                }
                flush();
            } else if (!timer) {
                timer = setTimeout(flush, waitMs - elapsed);
            }
        },
        cancel: () => {
            if (timer) {
                clearTimeout(timer);
                timer = null;
            }
            pendingArgs = null;
        },
    };
}

const CURSOR_THROTTLE_MS = 40;
const CURSOR_STALE_MS = 5000;
const CLEANUP_INTERVAL_MS = 1000;

interface RemoteCursor {
    userId: string;
    email: string;
    color: string;
    x: number;
    y: number;
    lastSeen: number;
}

const RemoteCursorMarker: React.FC<{ cursor: RemoteCursor }> = ({ cursor }) => {
    const name = cursor.email.split('@')[0] || cursor.email;

    return (
        <div
            className="pointer-events-none absolute left-0 top-0 z-50 transition-transform ease-linear"
            style={{
                transform: `translate(${cursor.x}px, ${cursor.y}px)`,
                transitionDuration: '80ms',
            }}
        >
            <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill={cursor.color}
                stroke="white"
                strokeWidth="1"
                className="drop-shadow"
            >
                <path d="M4 3 L20 12 L12.5 13.5 L9 21 Z" />
            </svg>
            <div
                className="ml-4 mt-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium text-white shadow"
                style={{ backgroundColor: cursor.color }}
            >
                {name}
            </div>
        </div>
    );
};

// Live cursor overlay, rendered inside <ReactFlow> (see
// src/pages/editor-page/canvas/canvas.tsx). Shares the per-diagram realtime
// channel with `PresenceAvatars` via the channel manager (../realtime/channel.ts).
export const SupabaseCanvasSlot: React.FC = () => {
    const { status, user } = useAuth();
    const { diagramId } = useChartDB();
    const { screenToFlowPosition } = useReactFlow();
    const [cursors, setCursors] = useState<Map<string, RemoteCursor>>(
        new Map()
    );

    const active = status === 'approved' && !!diagramId && !!user;
    const userId = user?.id;
    const userEmail = user?.email;

    // Kept up to date every render so the mousemove handler (bound once
    // per channel acquisition) always reads the latest coordinate
    // converter without forcing a resubscribe when it changes identity.
    const screenToFlowPositionRef = useRef(screenToFlowPosition);
    useEffect(() => {
        screenToFlowPositionRef.current = screenToFlowPosition;
    }, [screenToFlowPosition]);

    useEffect(() => {
        if (!active || !userId) {
            setCursors(new Map());
            return;
        }

        const email = userEmail ?? '';
        const color = colorForUserId(userId);

        const handle = acquireChannel(diagramId, { id: userId, email });
        if (!handle) {
            return;
        }

        const unsubscribeCursor = handle.onCursor((payload) => {
            if (payload.userId === userId) {
                return;
            }
            setCursors((prev) => {
                const next = new Map(prev);
                if (payload.hidden) {
                    next.delete(payload.userId);
                } else {
                    next.set(payload.userId, {
                        userId: payload.userId,
                        email: payload.email,
                        color: payload.color,
                        x: payload.x,
                        y: payload.y,
                        lastSeen: Date.now(),
                    });
                }
                return next;
            });
        });

        const unsubscribePresence = handle.onPresenceChange((participants) => {
            const liveIds = new Set(participants.map((p) => p.userId));
            setCursors((prev) => {
                let changed = false;
                const next = new Map(prev);
                next.forEach((_cursor, key) => {
                    if (!liveIds.has(key)) {
                        next.delete(key);
                        changed = true;
                    }
                });
                return changed ? next : prev;
            });
        });

        const staleCleanupInterval = setInterval(() => {
            setCursors((prev) => {
                const now = Date.now();
                let changed = false;
                const next = new Map(prev);
                next.forEach((cursor, key) => {
                    if (now - cursor.lastSeen > CURSOR_STALE_MS) {
                        next.delete(key);
                        changed = true;
                    }
                });
                return changed ? next : prev;
            });
        }, CLEANUP_INTERVAL_MS);

        const throttled = createTrailingThrottle(
            (payload: CursorBroadcastPayload) => handle.sendCursor(payload),
            CURSOR_THROTTLE_MS
        );

        const handleMouseMove = (event: MouseEvent): void => {
            const flowPosition = screenToFlowPositionRef.current({
                x: event.clientX,
                y: event.clientY,
            });
            throttled.call({
                userId,
                email,
                color,
                x: flowPosition.x,
                y: flowPosition.y,
            });
        };

        const handleHide = (): void => {
            throttled.cancel();
            handle.sendCursor({
                userId,
                email,
                color,
                x: 0,
                y: 0,
                hidden: true,
            });
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseleave', handleHide);
        window.addEventListener('blur', handleHide);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseleave', handleHide);
            window.removeEventListener('blur', handleHide);
            throttled.cancel();
            unsubscribeCursor();
            unsubscribePresence();
            clearInterval(staleCleanupInterval);
            releaseChannel(diagramId);
            setCursors(new Map());
        };
        // Resubscribing only on identity changes (diagram/user) is
        // intentional — `screenToFlowPosition` is read via the ref above so
        // it never has to be a dependency here.
    }, [active, diagramId, userId, userEmail]);

    if (!active) {
        return null;
    }

    return (
        <>
            <LiveEdits />
            <ViewportPortal>
                {Array.from(cursors.values()).map((cursor) => (
                    <RemoteCursorMarker key={cursor.userId} cursor={cursor} />
                ))}
            </ViewportPortal>
        </>
    );
};
