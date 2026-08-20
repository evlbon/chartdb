import React from 'react';

// Заглушка: реализуется на этапе 3. Оборачивает значение storageContext
// (перехват мутаций → debounce-push в Supabase, pull при монтировании)
// и ре-провайдит контекст ниже по дереву. Оригинальный storage-provider
// не модифицируется.
export const SupabaseStorageBridge: React.FC<React.PropsWithChildren> = ({
    children,
}) => <>{children}</>;
