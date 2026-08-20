import React from 'react';
import { isSupabaseEnabled } from './client';
import { UserMenu } from './auth/user-menu';
import { SyncIndicator } from './sync/sync-indicator';
import { ShareButton } from './sharing/share-button';
import { PresenceAvatars } from './realtime/presence-avatars';

// Единственная точка врезки в top-navbar оригинала.
export const SupabaseNavbarSlot: React.FC = () => {
    if (!isSupabaseEnabled) {
        return null;
    }

    return (
        <div className="flex items-center gap-2">
            <PresenceAvatars />
            <SyncIndicator />
            <ShareButton />
            <UserMenu />
        </div>
    );
};
