import React from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { TooltipProvider } from './components/tooltip/tooltip';
import { HelmetData } from './helmet/helmet-data';
import { HelmetProvider } from 'react-helmet-async';
import { SupabaseAuthProvider } from './supabase';

export const App = () => {
    return (
        <HelmetProvider>
            <HelmetData />
            <TooltipProvider>
                <SupabaseAuthProvider>
                    <RouterProvider router={router} />
                </SupabaseAuthProvider>
            </TooltipProvider>
        </HelmetProvider>
    );
};
