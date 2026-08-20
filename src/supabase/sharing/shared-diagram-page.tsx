import React, { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { CloudDownload } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { PendingApprovalScreen } from '../auth/require-auth';
import { fetchSharedDiagram, type SharedDiagramRow } from './share-api';
import { diagramFromJSONInput } from '@/lib/export-import-utils';
import type { Diagram } from '@/lib/domain/diagram';
import type { DatabaseType } from '@/lib/domain/database-type';
import type { DBTable } from '@/lib/domain/db-table';
import type { DBRelationship } from '@/lib/domain/db-relationship';
import { Spinner } from '@/components/spinner/spinner';
import { Button } from '@/components/button/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/card/card';
import { Badge } from '@/components/badge/badge';
import { Separator } from '@/components/separator/separator';
import {
    databaseSecondaryLogoMap,
    databaseTypeToLabelMap,
} from '@/lib/databases';
import { useStorage } from '@/hooks/use-storage';
import { useToast } from '@/components/toast/use-toast';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { StorageProvider } from '@/context/storage-context/storage-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';

const FullScreenSpinner: React.FC = () => (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Spinner size="large" />
    </div>
);

const InvalidShareCard: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="flex h-screen w-screen items-center justify-center bg-background px-4">
            <Card className="w-full max-w-md text-center">
                <CardHeader>
                    <CardTitle>Link not available</CardTitle>
                    <CardDescription>
                        This share link is invalid or has been revoked.
                    </CardDescription>
                </CardHeader>
                <CardFooter className="justify-center">
                    <Button onClick={() => navigate('/')}>Go to app</Button>
                </CardFooter>
            </Card>
        </div>
    );
};

// Shape of diagram_shares.content — a JSON blob produced by
// diagramToJSONOutput, so it matches Diagram minus the Date fields (which
// come through as ISO strings and are irrelevant for the preview below).
interface SharedDiagramContent {
    name: string;
    databaseType: DatabaseType;
    tables?: DBTable[];
    relationships?: DBRelationship[];
}

const MAX_PREVIEW_TABLES = 10;

const SharedDiagramPreview: React.FC<{ row: SharedDiagramRow }> = ({ row }) => {
    const navigate = useNavigate();
    const { addDiagram } = useStorage();
    const { toast } = useToast();
    const [copying, setCopying] = useState(false);

    const content = row.content as SharedDiagramContent;
    const tables = content.tables ?? [];
    const relationships = content.relationships ?? [];
    const previewTables = tables.slice(0, MAX_PREVIEW_TABLES);

    const copyToMyDiagrams = useCallback(async () => {
        setCopying(true);
        try {
            const diagram = diagramFromJSONInput(JSON.stringify(row.content));
            const now = new Date();
            const diagramToAdd: Diagram = {
                ...diagram,
                name: `${row.name} (copy)`,
                createdAt: now,
                updatedAt: now,
            };

            await addDiagram({ diagram: diagramToAdd });
            navigate(`/diagrams/${diagramToAdd.id}`);
        } catch {
            toast({
                title: 'Failed to copy diagram',
                variant: 'destructive',
            });
            setCopying(false);
        }
    }, [row, addDiagram, navigate, toast]);

    return (
        <div className="flex h-screen w-screen items-center justify-center overflow-auto bg-background px-4 py-10">
            <Card className="w-full max-w-xl">
                <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                        <CardTitle className="truncate">{row.name}</CardTitle>
                        <img
                            src={databaseSecondaryLogoMap[content.databaseType]}
                            alt={databaseTypeToLabelMap[content.databaseType]}
                            className="h-5 max-w-fit shrink-0"
                        />
                    </div>
                    <CardDescription>
                        Shared read-only diagram —{' '}
                        {databaseTypeToLabelMap[content.databaseType]}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>
                            Tables:{' '}
                            <span className="font-semibold text-foreground">
                                {tables.length}
                            </span>
                        </span>
                        <span>
                            Relationships:{' '}
                            <span className="font-semibold text-foreground">
                                {relationships.length}
                            </span>
                        </span>
                    </div>
                    {previewTables.length > 0 ? (
                        <>
                            <Separator />
                            <div className="flex flex-col gap-2">
                                {previewTables.map((table) => (
                                    <div
                                        key={table.id}
                                        className="flex items-center justify-between text-sm"
                                    >
                                        <span className="truncate">
                                            {table.name}
                                        </span>
                                        <Badge variant="secondary">
                                            {table.fields.length} columns
                                        </Badge>
                                    </div>
                                ))}
                                {tables.length > previewTables.length ? (
                                    <span className="text-xs text-muted-foreground">
                                        +{tables.length - previewTables.length}{' '}
                                        more table(s)
                                    </span>
                                ) : null}
                            </div>
                        </>
                    ) : null}
                </CardContent>
                <CardFooter>
                    <Button
                        className="w-full"
                        disabled={copying}
                        onClick={() => void copyToMyDiagrams()}
                    >
                        {copying ? (
                            <Spinner size="small" className="mr-2" />
                        ) : (
                            <CloudDownload className="mr-2" size={16} />
                        )}
                        Copy to my diagrams
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
};

const SharedDiagramLoader: React.FC<{ token: string }> = ({ token }) => {
    const [loading, setLoading] = useState(true);
    const [row, setRow] = useState<SharedDiagramRow | null>(null);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            try {
                const result = await fetchSharedDiagram(token);
                if (!cancelled) {
                    setRow(result);
                }
            } catch {
                if (!cancelled) {
                    setRow(null);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [token]);

    if (loading) {
        return <FullScreenSpinner />;
    }

    if (!row) {
        return <InvalidShareCard />;
    }

    return <SharedDiagramPreview row={row} />;
};

const SharedDiagramGate: React.FC = () => {
    const { token } = useParams<{ token: string }>();
    const { status } = useAuth();

    switch (status) {
        case 'disabled':
            return <Navigate to="/" replace />;
        case 'loading':
            return <FullScreenSpinner />;
        case 'signed-out':
            return <Navigate to="/login" replace />;
        case 'pending-approval':
            return <PendingApprovalScreen />;
        case 'approved':
            return token ? (
                <SharedDiagramLoader token={token} />
            ) : (
                <Navigate to="/" replace />
            );
    }
};

// Route target for /shared/:token. Lives outside the editor's provider
// tree, so it wraps the (small) set of providers it needs itself — mirrors
// clone-template-page.tsx.
export const SharedDiagramPage: React.FC = () => (
    <LocalConfigProvider>
        <StorageProvider>
            <ThemeProvider>
                <SharedDiagramGate />
            </ThemeProvider>
        </StorageProvider>
    </LocalConfigProvider>
);
