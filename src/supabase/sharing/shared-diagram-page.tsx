import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { CloudDownload } from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import { useAuth } from '../auth/auth-context';
import { PendingApprovalScreen } from '../auth/require-auth';
import { fetchSharedDiagram, type SharedDiagramRow } from './share-api';
import { diagramFromContent } from '../sync/serialize';
import { diagramFromJSONInput } from '@/lib/export-import-utils';
import type { Diagram } from '@/lib/domain/diagram';
import { Spinner } from '@/components/spinner/spinner';
import { Button } from '@/components/button/button';
import {
    Card,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/card/card';
import {
    databaseSecondaryLogoMap,
    databaseTypeToLabelMap,
} from '@/lib/databases';
import { useStorage } from '@/hooks/use-storage';
import { useToast } from '@/components/toast/use-toast';
import { LocalConfigProvider } from '@/context/local-config-context/local-config-provider';
import { StorageProvider } from '@/context/storage-context/storage-provider';
import { ThemeProvider } from '@/context/theme-context/theme-provider';
import { ChartDBProvider } from '@/context/chartdb-context/chartdb-provider';
import { DiffProvider } from '@/context/diff-context/diff-provider';
import { Canvas } from '@/pages/editor-page/canvas/canvas';
import { useChartDB } from '@/hooks/use-chartdb';
import { viewerModeContext } from './viewer-mode';

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

const CopyButtonInner: React.FC<{ row: SharedDiagramRow }> = ({ row }) => {
    const navigate = useNavigate();
    const { addDiagram } = useStorage();
    const { toast } = useToast();
    const [copying, setCopying] = useState(false);

    const copyToMyDiagrams = useCallback(async () => {
        setCopying(true);
        try {
            // Намеренно diagramFromJSONInput (а не diagramFromContent):
            // копия должна получить СВЕЖИЕ id, чтобы стать независимой
            // диаграммой, а не «двойником» оригинала в облаке.
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
        <Button disabled={copying} onClick={() => void copyToMyDiagrams()}>
            {copying ? (
                <Spinner size="small" className="mr-2" />
            ) : (
                <CloudDownload className="mr-2" size={16} />
            )}
            Copy to my diagrams
        </Button>
    );
};

// Реальное хранилище нужно только кнопке копирования. Канва ниже живёт БЕЗ
// StorageProvider — как у template-page: readonly ChartDBProvider пишет в
// заглушечный storage-контекст, локальная база зрителя не затрагивается.
const CopyButton: React.FC<{ row: SharedDiagramRow }> = ({ row }) => (
    <StorageProvider>
        <CopyButtonInner row={row} />
    </StorageProvider>
);

// ChartDBProvider сеет из prop `diagram` только сущности; diagramId у него
// выставляет лишь загрузчик редактора. Без diagramId realtime-слоты
// (курсоры, live-правки) считают, что диаграммы нет, и не подключаются —
// проставляем его явно.
const SharedDiagramBootstrap: React.FC<{ diagramId: string }> = ({
    diagramId,
}) => {
    const { diagramId: currentId, updateDiagramId } = useChartDB();

    useEffect(() => {
        if (currentId !== diagramId) {
            void updateDiagramId(diagramId);
        }
    }, [currentId, diagramId, updateDiagramId]);

    return null;
};

const SharedDiagramPreview: React.FC<{ row: SharedDiagramRow }> = ({ row }) => {
    // diagramFromContent сохраняет id — превью «живёт» в том же realtime-
    // канале, что и редактор владельца: зритель видит его курсор и правки.
    const diagram = useMemo<Diagram | null>(() => {
        try {
            return diagramFromContent(row.content);
        } catch {
            return null;
        }
    }, [row]);

    if (!diagram) {
        return <InvalidShareCard />;
    }

    return (
        <section className="flex h-screen w-screen select-none flex-col bg-background">
            <nav className="flex h-14 shrink-0 items-center justify-between border-b px-4">
                <div className="flex min-w-0 items-center gap-3">
                    <img
                        src={databaseSecondaryLogoMap[diagram.databaseType]}
                        alt={databaseTypeToLabelMap[diagram.databaseType]}
                        className="h-5 max-w-fit shrink-0"
                    />
                    <div className="flex min-w-0 flex-col">
                        <span className="truncate text-sm font-semibold">
                            {row.name}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                            Shared read-only diagram —{' '}
                            {databaseTypeToLabelMap[diagram.databaseType]}
                        </span>
                    </div>
                </div>
                <CopyButton row={row} />
            </nav>
            <div className="relative flex-1 overflow-hidden">
                <viewerModeContext.Provider value={true}>
                    <DiffProvider>
                        <ChartDBProvider diagram={diagram} readonly>
                            <SharedDiagramBootstrap diagramId={diagram.id} />
                            <Canvas initialTables={diagram.tables ?? []} />
                        </ChartDBProvider>
                    </DiffProvider>
                </viewerModeContext.Provider>
            </div>
        </section>
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

// Route target for /shared/:token. Провайдеры — по образцу template-page
// (LocalConfig > Theme > ReactFlow), StorageProvider намеренно НЕ здесь.
export const SharedDiagramPage: React.FC = () => (
    <LocalConfigProvider>
        <ThemeProvider>
            <ReactFlowProvider>
                <SharedDiagramGate />
            </ReactFlowProvider>
        </ThemeProvider>
    </LocalConfigProvider>
);
