import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: analysis, error } = await supabase
      .from('ai_analyses')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (!analysis) {
      return NextResponse.json({
        analysis: null,
        message: 'No analysis yet. Upload documents to get started.',
      });
    }

    return NextResponse.json({
      analysis: {
        id: analysis.id,
        ...analysis.detailed_breakdown,
        createdAt: analysis.created_at,
        attestationId: analysis.tee_attestation_id,
      },
    });
  } catch (error: any) {
    console.error('Get analysis error', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch analysis' }, { status: 500 });
  }
}
