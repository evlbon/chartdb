import React from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseEnabled } from '../client';
import { authContext, authInitialValue } from './auth-context';
import type { AuthContextValue, AuthStatus } from '../types';

// Provider used when Supabase is not configured — the app stays fully local.
const SupabaseAuthProviderDisabled: React.FC<React.PropsWithChildren> = ({
    children,
}) => (
    <authContext.Provider value={authInitialValue}>
        {children}
    </authContext.Provider>
);

// Resolves the auth status for a given session by checking the user's
// `profiles.approved` flag. Returns `null` when `requestId` is no longer the
// latest in-flight request, so the caller can safely discard a stale result.
const resolveSessionStatus = async (
    session: Session | null,
    requestId: number,
    latestRequestIdRef: React.MutableRefObject<number>
): Promise<{ status: AuthStatus; user: User | null } | null> => {
    if (!session?.user || !supabase) {
        return { status: 'signed-out', user: null };
    }

    const { user } = session;

    const { data, error } = await supabase
        .from('profiles')
        .select('approved')
        .eq('user_id', user.id)
        .single();

    // A newer auth state change happened while this request was in flight —
    // ignore this (now stale) result.
    if (latestRequestIdRef.current !== requestId) {
        return null;
    }

    if (error || !data) {
        return { status: 'pending-approval', user };
    }

    return {
        status: data.approved ? 'approved' : 'pending-approval',
        user,
    };
};

// Provider used when Supabase is configured — tracks the Supabase session
// and the associated profile approval status.
const SupabaseAuthProviderEnabled: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const [status, setStatus] = React.useState<AuthStatus>('loading');
    const [user, setUser] = React.useState<User | null>(null);

    // Incremented on every session change so async profile lookups can tell
    // whether they are still the most recent request before applying state.
    const latestRequestIdRef = React.useRef(0);

    React.useEffect(() => {
        if (!supabase) {
            return;
        }

        let mounted = true;

        const applySession = async (session: Session | null) => {
            latestRequestIdRef.current += 1;
            const requestId = latestRequestIdRef.current;

            const result = await resolveSessionStatus(
                session,
                requestId,
                latestRequestIdRef
            );

            if (!mounted || !result) {
                return;
            }

            setStatus(result.status);
            setUser(result.user);
        };

        void supabase.auth.getSession().then(({ data: { session } }) => {
            void applySession(session);
        });

        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((_event, session) => {
            void applySession(session);
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, []);

    const signIn = React.useCallback<AuthContextValue['signIn']>(
        async (email, password) => {
            if (!supabase) {
                return { error: 'auth is not configured' };
            }

            const { error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            return error ? { error: error.message } : {};
        },
        []
    );

    const signUp = React.useCallback<AuthContextValue['signUp']>(
        async (email, password) => {
            if (!supabase) {
                return { error: 'auth is not configured' };
            }

            const { error } = await supabase.auth.signUp({
                email,
                password,
            });

            return error ? { error: error.message } : {};
        },
        []
    );

    const signOut = React.useCallback<AuthContextValue['signOut']>(async () => {
        if (!supabase) {
            return;
        }

        await supabase.auth.signOut();
    }, []);

    const value = React.useMemo<AuthContextValue>(
        () => ({ status, user, signIn, signUp, signOut }),
        [status, user, signIn, signUp, signOut]
    );

    return (
        <authContext.Provider value={value}>{children}</authContext.Provider>
    );
};

export const SupabaseAuthProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) =>
    isSupabaseEnabled ? (
        <SupabaseAuthProviderEnabled>{children}</SupabaseAuthProviderEnabled>
    ) : (
        <SupabaseAuthProviderDisabled>{children}</SupabaseAuthProviderDisabled>
    );
