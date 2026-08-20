import React from 'react';
import type { RouteObject } from 'react-router-dom';

// Роуты форка. Подключаются одной строкой-spread в src/router.tsx.
export const supabaseRoutes: RouteObject[] = [
    {
        path: 'login',
        async lazy() {
            const { LoginPage } = await import('./auth/login-page');
            return { element: <LoginPage /> };
        },
    },
    {
        path: 'shared/:token',
        async lazy() {
            const { SharedDiagramPage } =
                await import('./sharing/shared-diagram-page');
            return { element: <SharedDiagramPage /> };
        },
    },
];
