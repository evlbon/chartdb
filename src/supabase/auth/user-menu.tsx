import React from 'react';
import { useAuth } from './auth-context';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/dropdown-menu/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/avatar/avatar';

// Rendered in the editor's top navbar (already wired up in navbar-slot.tsx,
// hidden whenever Supabase is disabled).
export const UserMenu: React.FC = () => {
    const { status, user, signOut } = useAuth();

    if (status !== 'approved' || !user) {
        return null;
    }

    const initial = (user.email ?? '?').charAt(0).toUpperCase();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger className="outline-none">
                <Avatar className="size-8 cursor-pointer">
                    <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">
                        {initial}
                    </AvatarFallback>
                </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem disabled className="truncate opacity-100">
                    {user.email}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()}>
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
