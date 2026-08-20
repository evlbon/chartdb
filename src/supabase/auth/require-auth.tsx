import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './auth-context';
import { Spinner } from '@/components/spinner/spinner';
import { Button } from '@/components/button/button';

// Full-screen message shown to a signed-in user whose profile has not been
// approved by the instance owner yet. Exported so LoginPage can reuse it.
export const PendingApprovalScreen: React.FC = () => {
    const { user, signOut } = useAuth();

    return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
            <h1 className="text-xl font-semibold text-foreground">
                Awaiting approval
            </h1>
            <p className="max-w-md text-sm text-muted-foreground">
                Your account is awaiting approval by the instance owner.
            </p>
            {user?.email ? (
                <p className="text-sm font-medium text-foreground">
                    {user.email}
                </p>
            ) : null}
            <Button variant="outline" onClick={() => void signOut()}>
                Sign out
            </Button>
        </div>
    );
};

const FullScreenSpinner: React.FC = () => (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Spinner size="large" />
    </div>
);

export const RequireAuth: React.FC<React.PropsWithChildren> = ({
    children,
}) => {
    const { status } = useAuth();

    switch (status) {
        case 'disabled':
        case 'approved':
            return <>{children}</>;
        case 'loading':
            return <FullScreenSpinner />;
        case 'signed-out':
            return <Navigate to="/login" replace />;
        case 'pending-approval':
            return <PendingApprovalScreen />;
    }
};
