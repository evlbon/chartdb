import React from 'react';
import { authContext, authInitialValue } from './auth-context';

// Заглушка: реализуется на этапе 2 (регистрация/вход/одобрение).
export const SupabaseAuthProvider: React.FC<React.PropsWithChildren> = ({
    children,
}) => (
    <authContext.Provider value={authInitialValue}>
        {children}
    </authContext.Provider>
);
