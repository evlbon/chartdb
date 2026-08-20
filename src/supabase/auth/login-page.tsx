import React from 'react';
import { Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useAuth } from './auth-context';
import { PendingApprovalScreen } from './require-auth';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/card/card';
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from '@/components/tabs/tabs';
import { Input } from '@/components/input/input';
import { Label } from '@/components/label/label';
import { Button } from '@/components/button/button';
import { Spinner } from '@/components/spinner/spinner';

const MIN_PASSWORD_LENGTH = 6;

type AuthMode = 'sign-in' | 'sign-up';

const AuthForm: React.FC<{ mode: AuthMode }> = ({ mode }) => {
    const { signIn, signUp } = useAuth();
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [error, setError] = React.useState<string | null>(null);
    const [submitting, setSubmitting] = React.useState(false);
    const [succeeded, setSucceeded] = React.useState(false);

    const handleSubmit = React.useCallback(
        async (event: React.FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            setError(null);

            const trimmedEmail = email.trim();

            if (!trimmedEmail || !password) {
                setError('Please fill in both email and password.');
                return;
            }

            if (password.length < MIN_PASSWORD_LENGTH) {
                setError(
                    `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
                );
                return;
            }

            setSubmitting(true);
            const action = mode === 'sign-in' ? signIn : signUp;
            const { error: actionError } = await action(trimmedEmail, password);
            setSubmitting(false);

            if (actionError) {
                setError(actionError);
                return;
            }

            setSucceeded(true);
        },
        [email, password, mode, signIn, signUp]
    );

    // RequireAuth resolves the final destination (editor vs. pending-approval
    // screen) once the auth provider picks up the new session.
    if (succeeded) {
        return <Navigate to="/" replace />;
    }

    return (
        <form
            className="flex flex-col gap-4"
            onSubmit={(event) => void handleSubmit(event)}
        >
            <div className="flex flex-col gap-2">
                <Label htmlFor={`${mode}-email`}>Email</Label>
                <Input
                    id={`${mode}-email`}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    disabled={submitting}
                    placeholder="you@example.com"
                />
            </div>
            <div className="flex flex-col gap-2">
                <Label htmlFor={`${mode}-password`}>Password</Label>
                <Input
                    id={`${mode}-password`}
                    type="password"
                    autoComplete={
                        mode === 'sign-in' ? 'current-password' : 'new-password'
                    }
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={submitting}
                    placeholder="At least 6 characters"
                />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" disabled={submitting} className="mt-2">
                {submitting ? (
                    <Spinner size="small" className="mr-2 text-current" />
                ) : null}
                {mode === 'sign-in' ? 'Sign in' : 'Sign up'}
            </Button>
        </form>
    );
};

const LoginForm: React.FC = () => (
    <div className="flex h-screen w-screen items-center justify-center bg-background px-4">
        <Card className="w-full max-w-sm">
            <CardHeader className="items-center text-center">
                <CardTitle className="text-2xl">ChartDB</CardTitle>
                <CardDescription>
                    Sign in to access your diagrams.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Tabs defaultValue="sign-in">
                    <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="sign-in">Sign in</TabsTrigger>
                        <TabsTrigger value="sign-up">Sign up</TabsTrigger>
                    </TabsList>
                    <TabsContent value="sign-in">
                        <AuthForm mode="sign-in" />
                    </TabsContent>
                    <TabsContent value="sign-up">
                        <AuthForm mode="sign-up" />
                    </TabsContent>
                </Tabs>
            </CardContent>
        </Card>
    </div>
);

export const LoginPage: React.FC = () => {
    const { status } = useAuth();

    switch (status) {
        case 'disabled':
        case 'approved':
            return <Navigate to="/" replace />;
        case 'pending-approval':
            return <PendingApprovalScreen />;
        case 'loading':
            return (
                <div className="flex h-screen w-screen items-center justify-center bg-background">
                    <Spinner size="large" />
                </div>
            );
        case 'signed-out':
            return (
                <>
                    <Helmet>
                        <title>ChartDB - Sign in</title>
                    </Helmet>
                    <LoginForm />
                </>
            );
    }
};
