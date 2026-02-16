import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ALLOWED_STATUSES = new Set(['pending', 'processing', 'completed', 'failed']);

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
    const status = (searchParams.get('status') || '').toLowerCase();
    const parsedLimit = Number(searchParams.get('limit') || '50');
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 50;

    let query = supabase
      .from('nova_documents')
      .select(
        'id,nova_document_id,file_name,file_size,file_type,mime_type,document_type,account_name,statement_period_start,statement_period_end,date_range_start,date_range_end,processing_status,processing_error,processed_at,transaction_count,total_income,total_expenses,created_at,updated_at',
      )
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (status && ALLOWED_STATUSES.has(status)) {
      query = query.eq('processing_status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({
      documents: data || [],
      count: (data || []).length,
    });
  } catch (error: any) {
    console.error('Get documents list error', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch documents' }, { status: 500 });
  }
}
