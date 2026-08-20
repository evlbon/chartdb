import React, { useCallback, useState } from 'react';
import { Share2 } from 'lucide-react';
import { useAuth } from '../auth/auth-context';
import { useChartDB } from '@/hooks/use-chartdb';
import { useToast } from '@/components/toast/use-toast';
import { Button } from '@/components/button/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/dropdown-menu/dropdown-menu';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { createShare, getShareForDiagram, revokeShare } from './share-api';

// Rendered in the editor's top navbar (already wired up in navbar-slot.tsx).
// Lets an approved user create/copy a read-only share link for the diagram
// currently open in the editor, and revoke it again.
export const ShareButton: React.FC = () => {
    const { status, user } = useAuth();
    const { diagramId } = useChartDB();
    const { toast } = useToast();

    // Whether a share row exists for this diagram. null = unknown/not
    // loaded yet (loaded lazily when the menu opens, not on every render).
    const [token, setToken] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const loadExistingShare = useCallback(async () => {
        if (!diagramId) return;

        try {
            const existing = await getShareForDiagram(diagramId);
            setToken(existing);
        } catch {
            toast({
                title: 'Failed to load share status',
                variant: 'destructive',
            });
        }
    }, [diagramId, toast]);

    const copyShareLink = useCallback(async () => {
        if (!diagramId || !user) return;

        setBusy(true);
        try {
            const shareToken = token ?? (await createShare(diagramId, user.id));
            setToken(shareToken);

            const url = `${window.location.origin}/shared/${shareToken}`;
            await navigator.clipboard.writeText(url);

            toast({ title: 'Share link copied' });
        } catch {
            toast({
                title: 'Failed to copy share link',
                variant: 'destructive',
            });
        } finally {
            setBusy(false);
        }
    }, [diagramId, token, user, toast]);

    const revokeShareLink = useCallback(async () => {
        if (!diagramId) return;

        setBusy(true);
        try {
            await revokeShare(diagramId);
            setToken(null);

            toast({ title: 'Share link revoked' });
        } catch {
            toast({
                title: 'Failed to revoke share link',
                variant: 'destructive',
            });
        } finally {
            setBusy(false);
        }
    }, [diagramId, toast]);

    if (status !== 'approved' || !diagramId) {
        return null;
    }

    return (
        <DropdownMenu
            onOpenChange={(open) => {
                if (open) {
                    void loadExistingShare();
                }
            }}
        >
            <Tooltip>
                <TooltipTrigger asChild>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="size-8 text-muted-foreground"
                            disabled={busy}
                            aria-label="Share diagram"
                        >
                            <Share2 className="size-4" />
                        </Button>
                    </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>Share diagram</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuItem
                    disabled={busy}
                    onSelect={() => void copyShareLink()}
                >
                    Copy share link
                </DropdownMenuItem>
                {token ? (
                    <DropdownMenuItem
                        disabled={busy}
                        onSelect={() => void revokeShareLink()}
                    >
                        Revoke share link
                    </DropdownMenuItem>
                ) : null}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
