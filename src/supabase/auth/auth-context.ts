import { createContext, useContext } from 'react';
import type { AuthContextValue } from '../types';

export const authInitialValue: AuthContextValue = {
    status: 'disabled',
    user: null,
    signIn: async () => ({ error: 'auth is not configured' }),
    signUp: async () => ({ error: 'auth is not configured' }),
    signOut: async () => {},
};

export const authContext = createContext<AuthContextValue>(authInitialValue);

export const useAuth = (): AuthContextValue => useContext(authContext);
