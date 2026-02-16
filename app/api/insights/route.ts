import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const category = searchParams.get('category');
    const impactLevel = searchParams.get('impact_level');
    const limit = Number(searchParams.get('limit') || 10);

    let query = supabase.from('insights').select('*').eq('user_id', user.id);

    if (status) query = query.eq('status', status);
    if (category) query = query.eq('category', category);
    if (impactLevel) query = query.eq('impact_level', impactLevel);

    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit);

    if (error) throw error;

    return NextResponse.json({ insights: data || [] });
  } catch (error: any) {
    console.error('Get insights error', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch insights' }, { status: 500 });
  }
}
