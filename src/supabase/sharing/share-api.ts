import { supabase } from '../client';

export interface DiagramShareRow {
    token: string;
}

export interface SharedDiagramRow {
    id: string;
    name: string;
    content: unknown;
    updated_at: string;
}

// Returns the existing share token for a diagram, or null if none exists.
export async function getShareForDiagram(
    diagramId: string
): Promise<string | null> {
    if (!supabase) return null;

    const { data, error } = await supabase
        .from('diagram_shares')
        .select('token')
        .eq('diagram_id', diagramId)
        .maybeSingle();

    if (error) throw error;

    return (data as DiagramShareRow | null)?.token ?? null;
}

// Creates a share row for the diagram (owned by the given user) and returns
// its token.
export async function createShare(
    diagramId: string,
    userId: string
): Promise<string> {
    if (!supabase) throw new Error('Supabase is not configured');

    const { data, error } = await supabase
        .from('diagram_shares')
        .insert({ diagram_id: diagramId, created_by: userId })
        .select('token')
        .single();

    if (error) throw error;

    return (data as DiagramShareRow).token;
}

// Deletes any share row(s) for the given diagram.
export async function revokeShare(diagramId: string): Promise<void> {
    if (!supabase) return;

    const { error } = await supabase
        .from('diagram_shares')
        .delete()
        .eq('diagram_id', diagramId);

    if (error) throw error;
}

// Fetches the shared diagram content for a token via the get_shared_diagram
// RPC. Resolves to null when the token is invalid/revoked, or when the
// caller is not an approved user — both cases return zero rows server-side.
export async function fetchSharedDiagram(
    token: string
): Promise<SharedDiagramRow | null> {
    if (!supabase) return null;

    const { data, error } = await supabase.rpc('get_shared_diagram', {
        share_token: token,
    });

    if (error) throw error;

    const rows = (data as SharedDiagramRow[] | null) ?? [];
    return rows[0] ?? null;
}
