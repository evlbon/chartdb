import { supabase, isSupabaseEnabled } from './client';
import { SUPABASE_URL } from '@/lib/env';

// Явно заданные OpenAI-переменные (runtime или build-time) отключают прокси —
// это осознанный opt-out владельца инстанса.
const hasExplicitAIConfig = (): boolean =>
    Boolean(
        window?.env?.OPENAI_API_KEY ||
        window?.env?.OPENAI_API_ENDPOINT ||
        import.meta.env.VITE_OPENAI_API_KEY ||
        import.meta.env.VITE_OPENAI_API_ENDPOINT
    );

// Прокси активен, когда сконфигурирован Supabase и владелец не задал
// собственный ключ/эндпоинт OpenAI.
export const isAIProxyEnabled = (): boolean =>
    isSupabaseEnabled && !hasExplicitAIConfig();

// Настройки для AI SDK: OpenAI-совместимый эндпоинт Edge Function, а в роли
// api key — JWT текущего пользователя (прокси пускает только одобренных).
export const getAIProxySettings = async (): Promise<{
    apiKey: string;
    baseUrl: string;
} | null> => {
    if (!isAIProxyEnabled() || !supabase) {
        return null;
    }

    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
        return null;
    }

    return {
        apiKey: session.access_token,
        baseUrl: `${SUPABASE_URL}/functions/v1/openai-proxy/v1`,
    };
};
