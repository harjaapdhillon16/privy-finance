import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createRouteHandlerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const status = body.status;

    if (!status) {
      return NextResponse.json({ error: 'Missing status' }, { status: 400 });
    }

    const updates: Record<string, any> = { status };
    const now = new Date().toISOString();

    if (status === 'viewed') updates.viewed_at = now;
    if (status === 'in_progress') updates.acted_on_at = now;
    if (status === 'completed') updates.completed_at = now;
    if (status === 'dismissed') updates.dismissed_at = now;

    const { data, error } = await supabase
      .from('insights')
      .update(updates)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, insight: data });
  } catch (error: any) {
    console.error('Update insight error', error);
    return NextResponse.json({ error: error.message || 'Failed to update insight' }, { status: 500 });
  }
}
