import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function buildHistoryFromSummaries(summaries: any[]) {
  let runningNetWorth = 0;

  return summaries
    .slice()
    .sort((a, b) => String(a.summary_month).localeCompare(String(b.summary_month)))
    .map((summary) => {
      const delta = Number(summary.total_income || 0) - Number(summary.total_expenses || 0);
      runningNetWorth += delta;

      return {
        date: summary.summary_month,
        netWorth: Number(runningNetWorth.toFixed(2)),
      };
    });
}

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
    const includeHistory = searchParams.get('history') === 'true';
    const includeGoals = searchParams.get('include_goals') === 'true';

    const [{ data: financial }, { data: summaries }, { data: goals }, { data: profile }, { data: onboarding }] =
      await Promise.all([
      supabase.from('financial_data').select('*').eq('user_id', user.id).maybeSingle(),
      includeHistory
        ? supabase
            .from('transaction_summaries')
            .select('summary_month,total_income,total_expenses')
            .eq('user_id', user.id)
            .order('summary_month', { ascending: true })
        : Promise.resolve({ data: [] as any[] }),
      includeGoals
        ? supabase.from('goals').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      supabase.from('user_profiles').select('currency').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('onboarding_data')
        .select('data_of_user')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      ]);

    const fallbackCurrency = String(onboarding?.data_of_user?.currency || '').toUpperCase();
    const currency = String(profile?.currency || fallbackCurrency || 'USD').toUpperCase();

    return NextResponse.json({
      currency,
      financial: financial || {},
      history: includeHistory ? buildHistoryFromSummaries(summaries || []) : undefined,
      goals: includeGoals ? goals || [] : undefined,
    });
  } catch (error: any) {
    console.error('Get financial data error', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch financial data' }, { status: 500 });
  }
}
