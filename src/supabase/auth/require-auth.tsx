import React from 'react';

// Заглушка: реализуется на этапе 2 (redirect на /login, экран «ожидает одобрения»).
export const RequireAuth: React.FC<React.PropsWithChildren> = ({
    children,
}) => <>{children}</>;
