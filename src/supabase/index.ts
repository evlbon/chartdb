// Публичная поверхность модуля — только эти экспорты используются
// оригинальным кодом (точки врезки). Всё остальное — внутренности модуля.
export { supabase, isSupabaseEnabled } from './client';
export { isAIProxyEnabled, getAIProxySettings } from './ai-proxy';
export { SupabaseAuthProvider } from './auth/auth-provider';
export { RequireAuth } from './auth/require-auth';
export { SupabaseStorageBridge } from './sync/storage-bridge';
export { SupabaseNavbarSlot } from './navbar-slot';
export { SupabaseCanvasSlot } from './realtime/canvas-slot';
export { supabaseRoutes } from './routes';
