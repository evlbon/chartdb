import { createContext, useContext } from 'react';
import type { SyncStatus } from '../types';

export interface SyncContextValue {
    status: SyncStatus;
    lastSyncedAt: Date | null;
}

// Default value used whenever the bridge is inactive (Supabase disabled or
// the user is not an approved, signed-in user) — no provider is mounted in
// that case, so consumers fall back to this value automatically.
export const syncInitialValue: SyncContextValue = {
    status: 'idle',
    lastSyncedAt: null,
};

export const syncContext = createContext<SyncContextValue>(syncInitialValue);

export const useSyncStatus = (): SyncContextValue => useContext(syncContext);
