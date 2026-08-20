import React from 'react';
import { Cloud, CloudAlert, CloudOff, RefreshCw } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';
import { useAuth } from '../auth/auth-context';
import { useSyncStatus } from './sync-context';
import type { SyncStatus } from '../types';

const statusLabel: Record<SyncStatus, string> = {
    idle: 'Synced to cloud',
    syncing: 'Syncing…',
    offline: 'Offline — changes will sync later',
    error: 'Sync error',
};

const StatusIcon: React.FC<{ status: SyncStatus }> = ({ status }) => {
    switch (status) {
        case 'syncing':
            return <RefreshCw className="size-4 animate-spin" />;
        case 'offline':
            return <CloudOff className="size-4" />;
        case 'error':
            return <CloudAlert className="size-4" />;
        case 'idle':
        default:
            return <Cloud className="size-4" />;
    }
};

// Small cloud-sync status icon rendered in the top navbar. Reflects the
// current SyncStatus provided by SupabaseStorageBridge.
export const SyncIndicator: React.FC = () => {
    const { status } = useAuth();
    const { status: syncStatus } = useSyncStatus();

    if (status !== 'approved') {
        return null;
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <div className="flex items-center justify-center text-muted-foreground">
                    <StatusIcon status={syncStatus} />
                </div>
            </TooltipTrigger>
            <TooltipContent>{statusLabel[syncStatus]}</TooltipContent>
        </Tooltip>
    );
};
