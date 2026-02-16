import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function toNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safePercent(part: number, total: number) {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

function stdDev(values: number[]) {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) * (value - mean), 0) / values.length;
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeTopMerchants(input: unknown) {
  if (Array.isArray(input)) {
    return input
      .map((entry: any) => ({
        name: String(entry?.name || '').trim(),
        amount: toNumber(entry?.amount),
        count: toNumber(entry?.count),
      }))
      .filter((entry) => entry.name);
  }

  if (input && typeof input === 'object') {
    return Object.entries(input as Record<string, any>)
      .map(([name, entry]) => ({
        name: String(name || '').trim(),
        amount: toNumber(entry?.amount),
        count: toNumber(entry?.count),
      }))
      .filter((entry) => entry.name);
  }

  return [] as Array<{ name: string; amount: number; count: number }>;
}

function normalizeTransactions(input: unknown, summaryMonth: string) {
  if (!Array.isArray(input)) {
    return [] as Array<{ date: string; description: string; amount: number; category: string; summaryMonth: string }>;
  }

  return input
    .map((entry: any) => ({
      date: String(entry?.date || summaryMonth || '').trim(),
      description: String(entry?.description || '').trim(),
      amount: toNumber(entry?.amount),
      category: String(entry?.category || 'other').trim() || 'other',
      summaryMonth,
    }))
    .filter((entry) => entry.date && entry.description && Number.isFinite(entry.amount));
}

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

    const [
      { data: summaries, error: summariesError },
      { data: insights, error: insightsError },
      { data: analysisRow, error: analysisError },
      { data: financialData, error: financialError },
      { data: userProfile, error: profileError },
      { data: onboardingRow, error: onboardingError },
    ] = await Promise.all([
      supabase
        .from('transaction_summaries')
        .select(
          'summary_month,total_income,total_expenses,income_count,expense_count,expenses_by_category,top_merchants,all_transactions',
        )
        .eq('user_id', user.id)
        .order('summary_month', { ascending: false })
        .limit(18),
      supabase.from('insights').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50),
      supabase
        .from('ai_analyses')
        .select('id,detailed_breakdown,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('financial_data')
        .select('monthly_income,total_monthly_expenses,cash_savings,net_worth')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('user_profiles').select('currency').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('onboarding_data')
        .select('data_of_user')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (summariesError) throw summariesError;
    if (insightsError) throw insightsError;
    if (analysisError) throw analysisError;
    if (financialError) throw financialError;
    if (profileError) throw profileError;
    if (onboardingError) throw onboardingError;

    const monthlyRows = (summaries || []).slice().reverse();

    const monthlySeries = monthlyRows.map((row: any) => {
      const income = toNumber(row.total_income);
      const expenses = toNumber(row.total_expenses);
      const net = income - expenses;
      const savingsRate = safePercent(net, income);

      return {
        month: String(row.summary_month),
        income,
        expenses,
        net,
        savingsRate: Number(savingsRate.toFixed(2)),
        incomeCount: toNumber(row.income_count),
        expenseCount: toNumber(row.expense_count),
      };
    });

    const totalIncome = monthlySeries.reduce((sum, row) => sum + row.income, 0);
    const totalExpenses = monthlySeries.reduce((sum, row) => sum + row.expenses, 0);
    const totalNet = totalIncome - totalExpenses;
    const monthCount = Math.max(monthlySeries.length, 1);

    const averageIncome = totalIncome / monthCount;
    const averageExpenses = totalExpenses / monthCount;
    const averageNet = totalNet / monthCount;
    const savingsRate = safePercent(averageNet, averageIncome);

    const expensesStdDev = stdDev(monthlySeries.map((row) => row.expenses));
    const expenseVolatility = safePercent(expensesStdDev, averageExpenses);

    const categoryTotals: Record<string, number> = {};
    const merchantTotals: Record<string, { amount: number; count: number }> = {};

    for (const row of monthlyRows) {
      for (const [category, value] of Object.entries(row.expenses_by_category || {})) {
        categoryTotals[category] = toNumber(categoryTotals[category]) + toNumber(value);
      }

      for (const merchant of normalizeTopMerchants(row.top_merchants)) {
        if (!merchantTotals[merchant.name]) {
          merchantTotals[merchant.name] = { amount: 0, count: 0 };
        }
        merchantTotals[merchant.name].amount += merchant.amount;
        merchantTotals[merchant.name].count += merchant.count;
      }
    }

    const spendingByCategory = Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        category,
        amount: Number(amount.toFixed(2)),
        percentage: Number(safePercent(amount, totalExpenses).toFixed(2)),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    const topMerchants = Object.entries(merchantTotals)
      .map(([name, stats]) => ({
        name,
        amount: Number(stats.amount.toFixed(2)),
        count: stats.count,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);

    const recentTransactions = monthlyRows
      .flatMap((row: any) => normalizeTransactions(row.all_transactions, String(row.summary_month)))
      .sort((a, b) => {
        const dateDelta = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (Number.isFinite(dateDelta) && dateDelta !== 0) return dateDelta;
        return Math.abs(b.amount) - Math.abs(a.amount);
      })
      .slice(0, 500);

    const insightRows = insights || [];
    const impactCounts: Record<string, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    const insightCategoryCounts: Record<string, number> = {};

    let potentialSavings = 0;
    let potentialEarnings = 0;

    for (const insight of insightRows) {
      const impact = String(insight.impact_level || 'medium').toLowerCase();
      impactCounts[impact] = toNumber(impactCounts[impact]) + 1;

      const category = String(insight.category || 'other').toLowerCase();
      insightCategoryCounts[category] = toNumber(insightCategoryCounts[category]) + 1;

      potentialSavings += toNumber(insight.potential_savings);
      potentialEarnings += toNumber(insight.potential_earnings);
    }

    const impactDistribution = Object.entries(impactCounts)
      .map(([impact, count]) => ({ impact, count }))
      .filter((entry) => entry.count > 0);

    const insightCategoryDistribution = Object.entries(insightCategoryCounts)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const bestMonth = monthlySeries.reduce(
      (best, row) => (row.net > best.net ? row : best),
      monthlySeries[0] || { month: null, net: 0 },
    );
    const worstMonth = monthlySeries.reduce(
      (worst, row) => (row.net < worst.net ? row : worst),
      monthlySeries[0] || { month: null, net: 0 },
    );

    const projectedAnnualNet = averageNet * 12;
    const monthsOfRunway =
      averageExpenses > 0 ? toNumber(financialData?.cash_savings) / averageExpenses : 0;

    const optimizationScore = clamp(
      50 + savingsRate * 1.25 - expenseVolatility * 0.35 + safePercent(potentialSavings, averageIncome * 12) * 0.25,
      0,
      100,
    );

    const latestAnalysis = analysisRow?.detailed_breakdown || null;
    const fallbackCurrency = String(onboardingRow?.data_of_user?.currency || '').toUpperCase();
    const currency = String(userProfile?.currency || fallbackCurrency || 'USD').toUpperCase();

    return NextResponse.json({
      currency,
      metrics: {
        averageIncome: Number(averageIncome.toFixed(2)),
        averageExpenses: Number(averageExpenses.toFixed(2)),
        averageNet: Number(averageNet.toFixed(2)),
        savingsRate: Number(savingsRate.toFixed(2)),
        expenseVolatility: Number(expenseVolatility.toFixed(2)),
        projectedAnnualNet: Number(projectedAnnualNet.toFixed(2)),
        potentialSavings: Number(potentialSavings.toFixed(2)),
        potentialEarnings: Number(potentialEarnings.toFixed(2)),
        opportunityPool: Number((potentialSavings + potentialEarnings).toFixed(2)),
        monthsOfRunway: Number(monthsOfRunway.toFixed(2)),
        optimizationScore: Number(optimizationScore.toFixed(1)),
        netWorth: toNumber(financialData?.net_worth),
      },
      monthlySeries,
      spendingByCategory,
      topMerchants,
      impactDistribution,
      insightCategoryDistribution,
      recentTransactions,
      bestMonth,
      worstMonth,
      analysisHighlights: {
        overall: latestAnalysis?.overall || null,
        spending: latestAnalysis?.spending || null,
        cashFlow: latestAnalysis?.cashFlow || null,
        recommendations: Array.isArray(latestAnalysis?.recommendations)
          ? latestAnalysis.recommendations
          : [],
      },
      insights: insightRows,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Optimization deep insights error', error);
    return NextResponse.json(
      { error: error.message || 'Failed to build optimization insights' },
      { status: 500 },
    );
  }
}
