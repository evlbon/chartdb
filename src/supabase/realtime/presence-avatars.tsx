import React from 'react';
import { useAuth } from '../auth/auth-context';
import { useChartDB } from '@/hooks/use-chartdb';
import { useDiagramPresence } from './use-diagram-presence';
import { Avatar, AvatarFallback } from '@/components/avatar/avatar';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/tooltip/tooltip';

const MAX_VISIBLE_AVATARS = 5;

// Row of overlapping avatars for everyone else currently viewing this
// diagram. Rendered in the top navbar (see ../navbar-slot.tsx).
export const PresenceAvatars: React.FC = () => {
    const { status } = useAuth();
    const { diagramId } = useChartDB();
    const { others } = useDiagramPresence(
        status === 'approved' ? diagramId : undefined
    );

    if (status !== 'approved' || !diagramId || others.length === 0) {
        return null;
    }

    const visible = others.slice(0, MAX_VISIBLE_AVATARS);
    const overflowCount = others.length - visible.length;

    return (
        <div className="flex items-center -space-x-2">
            {visible.map((participant) => (
                <Tooltip key={participant.userId}>
                    <TooltipTrigger asChild>
                        <Avatar className="size-7 border-2 border-background">
                            <AvatarFallback
                                style={{ backgroundColor: participant.color }}
                                className="text-xs font-medium text-white"
                            >
                                {participant.email.charAt(0).toUpperCase() ||
                                    '?'}
                            </AvatarFallback>
                        </Avatar>
                    </TooltipTrigger>
                    <TooltipContent>{participant.email}</TooltipContent>
                </Tooltip>
            ))}
            {overflowCount > 0 ? (
                <Avatar className="size-7 border-2 border-background">
                    <AvatarFallback className="bg-muted text-xs font-medium">
                        +{overflowCount}
                    </AvatarFallback>
                </Avatar>
            ) : null}
        </div>
    );
};
