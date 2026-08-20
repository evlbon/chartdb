// OpenAI-compatible proxy: keeps the OpenAI API key in Supabase secrets so
// it never reaches the browser or the Docker image. Only approved users
// (profiles.approved = true) may call it; the gateway has already verified
// the Supabase JWT signature (verify_jwt = true).
//
// The frontend points the AI SDK at
//   <SUPABASE_URL>/functions/v1/openai-proxy/v1
// with the user's access token as the "api key"; any path under /v1 is
// forwarded to api.openai.com with the real key attached.
import { createClient } from 'npm:@supabase/supabase-js@2';

const OPENAI_BASE = 'https://api.openai.com';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
        'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const jsonError = (status: number, message: string): Response =>
    new Response(JSON.stringify({ error: { message } }), {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // The caller's JWT was signature-checked by the gateway; RLS on
    // profiles ("own profile" select policy) makes this query return the
    // caller's own row only.
    const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_ANON_KEY')!,
        {
            global: {
                headers: {
                    Authorization: req.headers.get('Authorization') ?? '',
                },
            },
        }
    );

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('approved')
        .maybeSingle();

    if (profileError || !profile?.approved) {
        return jsonError(403, 'Account is not approved for AI features');
    }

    const openaiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiKey) {
        return jsonError(
            500,
            'OPENAI_API_KEY secret is not set for the openai-proxy function'
        );
    }

    const url = new URL(req.url);
    const upstreamPath = url.pathname.replace(/^.*?\/openai-proxy/, '');
    if (!upstreamPath.startsWith('/v1/')) {
        return jsonError(404, `Unsupported path: ${upstreamPath}`);
    }

    const upstream = await fetch(`${OPENAI_BASE}${upstreamPath}${url.search}`, {
        method: req.method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openaiKey}`,
        },
        body: req.method === 'GET' ? undefined : await req.text(),
    });

    // Pass the (possibly streaming) body straight through.
    const headers = new Headers(corsHeaders);
    const contentType = upstream.headers.get('content-type');
    if (contentType) {
        headers.set('Content-Type', contentType);
    }

    return new Response(upstream.body, {
        status: upstream.status,
        headers,
    });
});
