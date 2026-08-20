import type { User } from '@supabase/supabase-js';

// 'disabled' — Supabase не сконфигурирован, приложение работает чисто локально.
export type AuthStatus =
    | 'disabled'
    | 'loading'
    | 'signed-out'
    | 'pending-approval'
    | 'approved';

export interface AuthContextValue {
    status: AuthStatus;
    user: User | null;
    signIn: (email: string, password: string) => Promise<{ error?: string }>;
    signUp: (email: string, password: string) => Promise<{ error?: string }>;
    signOut: () => Promise<void>;
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';
