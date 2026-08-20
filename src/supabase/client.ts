import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/env';

export const supabase: SupabaseClient | null =
    SUPABASE_URL && SUPABASE_ANON_KEY
        ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
        : null;

export const isSupabaseEnabled = supabase !== null;
