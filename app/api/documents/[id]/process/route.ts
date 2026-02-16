import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { NovaStorageService } from '@/lib/nova/client';
import { NEARAIService } from '@/lib/near-ai/client';
import {
  extractPdfTextChunks,
  parseBankStatement,
  type ParseResult,
  type ParsedTransaction,
} from '@/lib/utils/csv-parser';
import { groupTransactionsByMonth } from '@/lib/utils/transactions';

export const dynamic = 'force-dynamic';

const NUMERIC_12_2_MAX_ABS = 9_999_999_999.99;
const DEFAULT_MAX_TRANSACTION_ABS = 5_000_000;

function isPdfStatement(file: File) {
  const lower = file.name.toLowerCase();
  return lower.endsWith('.pdf') || file.type.includes('pdf');
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function clampNumeric12(value: number) {
  if (!Number.isFinite(value)) return 0;
  const bounded = Math.min(Math.max(value, -NUMERIC_12_2_MAX_ABS), NUMERIC_12_2_MAX_ABS);
  return roundMoney(bounded);
}

function toNullableNumeric12(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return clampNumeric12(parsed);
}

function getMaxTransactionAbs() {
  const parsed = Number(process.env.PROCESSING_MAX_TRANSACTION_ABS || process.env.NEAR_AI_MAX_TRANSACTION_AMOUNT);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(parsed, NUMERIC_12_2_MAX_ABS);
  }
  return DEFAULT_MAX_TRANSACTION_ABS;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeTransactionsForStorage(transactions: ParsedTransaction[]) {
  const maxAbs = getMaxTransactionAbs();

  return transactions
    .map((tx) => ({
      date: String(tx.date || '').trim(),
      description: String(tx.description || '').trim(),
      amount: Number(tx.amount),
      category: String(tx.category || '').trim() || 'other',
    }))
    .filter((tx) => isIsoDate(tx.date))
    .filter((tx) => tx.description.length > 0)
    .filter((tx) => Number.isFinite(tx.amount))
    .filter((tx) => Math.abs(tx.amount) >= 0.01)
    .filter((tx) => Math.abs(tx.amount) <= maxAbs)
    .map((tx) => ({
      ...tx,
      amount: roundMoney(tx.amount),
    }));
}

function buildParseResultFromTransactions(
  transactions: ParsedTransaction[],
  sourceChunks: string[] = [],
): ParseResult {
  const sanitizedTransactions = sanitizeTransactionsForStorage(transactions);

  if (sanitizedTransactions.length === 0) {
    throw new Error('No valid transaction rows were found after parsing and sanitization');
  }

  const sorted = [...sanitizedTransactions].sort((a, b) => a.date.localeCompare(b.date));
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const tx of sorted) {
    if (tx.amount > 0) {
      totalIncome += tx.amount;
    } else {
      totalExpenses += Math.abs(tx.amount);
    }
  }

  return {
    transactions: sorted,
    totalIncome: clampNumeric12(totalIncome),
    totalExpenses: clampNumeric12(totalExpenses),
    dateRange: {
      start: sorted[0].date,
      end: sorted[sorted.length - 1].date,
    },
    sourceChunks,
  };
}

function buildFallbackAnalysis(monthlySummaries: Record<string, any>, financialData: any) {
  const months = Object.values(monthlySummaries);

  const totalIncome = months.reduce((acc: number, item: any) => acc + Number(item.total_income || 0), 0);
  const totalExpenses = months.reduce((acc: number, item: any) => acc + Number(item.total_expenses || 0), 0);
  const monthCount = months.length || 1;

  const monthlyIncome = totalIncome / monthCount;
  const monthlyExpenses = totalExpenses / monthCount;
  const savingsRate = monthlyIncome > 0 ? ((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100 : 0;

  const healthScore =
    savingsRate >= 25 ? 'Strong' : savingsRate >= 15 ? 'Good' : savingsRate >= 5 ? 'Fair' : 'Needs Improvement';

  const expensesByCategory = months.reduce((acc: Record<string, number>, item: any) => {
    for (const [category, amount] of Object.entries(item.expenses_by_category || {})) {
      acc[category] = (acc[category] || 0) + Number(amount || 0);
    }
    return acc;
  }, {});

  const topCategories = Object.entries(expensesByCategory)
    .map(([category, amount]) => ({ category, amount: Number(amount) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
    .map((entry) => ({
      ...entry,
      percentage: totalExpenses > 0 ? Number(((entry.amount / totalExpenses) * 100).toFixed(2)) : 0,
    }));

  return {
    overall: {
      healthScore,
      netWorth: Number(financialData?.net_worth || 0),
      summary: 'Generated fallback analysis due to temporary AI unavailability.',
    },
    cashFlow: {
      monthlyIncome: Number(monthlyIncome.toFixed(2)),
      monthlyExpenses: Number(monthlyExpenses.toFixed(2)),
      savingsRate: Number(savingsRate.toFixed(2)),
      assessment:
        savingsRate >= 15
          ? 'Cash flow is healthy with stable savings potential.'
          : 'Expenses are absorbing most income. Focus on high-impact reductions.',
      topCategories,
    },
    spending: {
      patterns: ['Monthly spending was summarized from uploaded transactions.'],
      concerns:
        savingsRate < 10
          ? ['Savings rate is below recommended 10-20% range.']
          : ['No major spending concerns detected.'],
      positives:
        savingsRate >= 15
          ? ['You are maintaining a strong monthly savings trend.']
          : ['Income appears stable across the analyzed months.'],
    },
    recommendations: ['Prioritize high-interest debt payoff', 'Automate monthly transfers to savings'],
  };
}

function buildFallbackInsights(analysis: any) {
  const monthlyIncome = Number(analysis?.cashFlow?.monthlyIncome || 0);
  const savingsRate = Number(analysis?.cashFlow?.savingsRate || 0);
  const baseline = Math.max(monthlyIncome, 1);

  return [
    {
      category: 'cashflow',
      title: 'Set an automatic monthly savings transfer',
      description: 'Automating savings improves consistency and reduces overspending risk.',
      potentialSavings: savingsRate < 10 ? Number((baseline * 0.04).toFixed(2)) : Number((baseline * 0.02).toFixed(2)),
      potentialEarnings: null,
      impactLevel: savingsRate < 10 ? 'high' : 'medium',
      actionSteps: ['Set auto-transfer for payday', 'Start with 5-10% of income'],
      complexity: 'easy',
      estimatedTime: '15 minutes',
    },
    {
      category: 'debt',
      title: 'Accelerate high-interest debt payments',
      description: 'Targeting high-interest balances first typically delivers the fastest guaranteed return.',
      potentialSavings: Number((baseline * 0.08).toFixed(2)),
      potentialEarnings: null,
      impactLevel: 'high',
      actionSteps: ['List debts by APR', 'Allocate extra payment to highest APR debt'],
      complexity: 'medium',
      estimatedTime: '1 hour setup',
    },
  ];
}

function buildFallbackGoals(analysis: any) {
  const monthlyIncome = Number(analysis?.cashFlow?.monthlyIncome || 0);
  const monthlyExpenses = Number(analysis?.cashFlow?.monthlyExpenses || 0);
  const monthlySavings = Math.max(monthlyIncome - monthlyExpenses, 0);
  const annualIncome = Math.max(monthlyIncome * 12, 12_000);
  const emergencyTarget = Math.max(monthlyExpenses * 3, 3_000);
  const debtTarget = Math.max(monthlyExpenses * 1.5, 2_000);
  const investingTarget = Math.max(annualIncome * 0.15, 5_000);
  const incomeGrowthTarget = Math.max(monthlyIncome * 2, 4_000);
  const retirementTarget = Math.max(annualIncome * 0.1, 6_000);
  const conservativeContribution = Math.max(monthlySavings * 0.5, 100);
  const growthContribution = Math.max(monthlySavings * 0.3, 150);

  return [
    {
      name: 'Build 3-month emergency fund',
      description: 'Create a cash buffer equal to at least three months of expenses.',
      category: 'emergency_fund',
      targetAmount: Number(emergencyTarget.toFixed(2)),
      currentAmount: 0,
      targetDate: null,
      monthlyContribution: Number(conservativeContribution.toFixed(2)),
      priority: 1,
    },
    {
      name: 'Pay down high-interest debt',
      description: 'Reduce interest costs by aggressively targeting the highest-rate debt first.',
      category: 'debt',
      targetAmount: Number(debtTarget.toFixed(2)),
      currentAmount: 0,
      targetDate: null,
      monthlyContribution: Number(Math.max(growthContribution, 150).toFixed(2)),
      priority: 2,
    },
    {
      name: 'Increase monthly savings rate',
      description: 'Automate recurring transfers to consistently increase monthly savings.',
      category: 'savings',
      targetAmount: Number(Math.max(annualIncome * 0.2, 4_000).toFixed(2)),
      currentAmount: 0,
      targetDate: null,
      monthlyContribution: Number(Math.max(monthlySavings, 200).toFixed(2)),
      priority: 3,
    },
    {
      name: 'Build long-term investment base',
      description: 'Contribute monthly to a diversified portfolio aligned with your risk profile.',
      category: 'investing',
      targetAmount: Number(investingTarget.toFixed(2)),
      currentAmount: 0,
      targetDate: null,
      monthlyContribution: Number(Math.max(growthContribution, 250).toFixed(2)),
      priority: 4,
    },
    {
      name: 'Grow primary income capacity',
      description: 'Invest in skills, certifications, or side income channels to raise earnings.',
      category: 'income',
      targetAmount: Number(incomeGrowthTarget.toFixed(2)),
      currentAmount: 0,
      targetDate: null,
      monthlyContribution: Number(Math.max(conservativeContribution, 120).toFixed(2)),
      priority: 5,
    },
    {
      name: 'Increase retirement contributions',
      description: 'Set up a consistent retirement contribution to compound long-term wealth.',
      category: 'retirement',
      targetAmount: Number(retirementTarget.toFixed(2)),
      currentAmount: 0,
      targetDate: null,
      monthlyContribution: Number(Math.max(growthContribution, 200).toFixed(2)),
      priority: 5,
    },
  ];
}

function normalizeGoalName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toNonNegativeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(parsed, 0);
}

function toGoalDate(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const trimmed = value.trim();
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

function normalizeGoalCategory(value: unknown) {
  const allowed = new Set(['savings', 'debt', 'investing', 'emergency_fund', 'income', 'retirement', 'other']);
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return allowed.has(normalized) ? normalized : 'other';
}

function buildCombinedMonthlySummaries(rows: any[]) {
  return rows.reduce(
    (acc, row) => {
      const monthKey = String(row.summary_month);
      acc[monthKey] = {
        total_income: Number(row.total_income || 0),
        income_count: Number(row.income_count || 0),
        income_by_source: row.income_by_source || {},
        total_expenses: Number(row.total_expenses || 0),
        expense_count: Number(row.expense_count || 0),
        expenses_by_category: row.expenses_by_category || {},
        top_merchants: row.top_merchants || [],
      };
      return acc;
    },
    {} as Record<string, any>,
  );
}

type StoredTransaction = {
  date: string;
  description: string;
  amount: number;
  category: string;
  source_document_id?: string;
};

function normalizeStoredTransactions(input: unknown): StoredTransaction[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item: any) => ({
      date: String(item?.date || '').trim(),
      description: String(item?.description || '').trim(),
      amount: Number(item?.amount || 0),
      category: String(item?.category || 'other').trim() || 'other',
      source_document_id:
        item?.source_document_id === undefined || item?.source_document_id === null
          ? undefined
          : String(item.source_document_id).trim() || undefined,
    }))
    .filter((item) => item.date && item.description && Number.isFinite(item.amount))
    .filter((item) => isIsoDate(item.date))
    .filter((item) => Math.abs(item.amount) >= 0.01)
    .filter((item) => Math.abs(item.amount) <= getMaxTransactionAbs())
    .map((item) => ({
      ...item,
      amount: roundMoney(item.amount),
    }));
}

function buildTransactionsByMonth(
  transactions: Array<{ date: string; description: string; amount: number; category: string }>,
  sourceDocumentId: string,
) {
  const grouped: Record<string, StoredTransaction[]> = {};

  for (const tx of transactions) {
    const month = `${tx.date.substring(0, 7)}-01`;
    if (!grouped[month]) grouped[month] = [];
    grouped[month].push({
      date: tx.date,
      description: tx.description,
      amount: Number(tx.amount),
      category: tx.category || 'other',
      source_document_id: sourceDocumentId,
    });
  }

  return grouped;
}

function mergeAllTransactions(existing: unknown, incoming: unknown, sourceDocumentId: string) {
  const existingTransactions = normalizeStoredTransactions(existing).filter(
    (tx) => tx.source_document_id !== sourceDocumentId,
  );
  const incomingTransactions = normalizeStoredTransactions(incoming).map((tx) => ({
    ...tx,
    source_document_id: sourceDocumentId,
  }));

  return [...existingTransactions, ...incomingTransactions].sort((a, b) => a.date.localeCompare(b.date));
}

function summarizeTransactions(transactions: StoredTransaction[]) {
  const summary = {
    total_income: 0,
    income_count: 0,
    income_by_source: {} as Record<string, number>,
    total_expenses: 0,
    expense_count: 0,
    expenses_by_category: {} as Record<string, number>,
    top_merchants: [] as Array<{ name: string; amount: number; count: number }>,
  };

  const merchantMap: Record<string, { amount: number; count: number }> = {};

  for (const tx of transactions) {
    if (tx.amount > 0) {
      summary.total_income += tx.amount;
      summary.income_count += 1;
      const source = String(tx.category || 'income_other').replace('income_', '') || 'other';
      summary.income_by_source[source] = Number((summary.income_by_source[source] || 0) + tx.amount);
      continue;
    }

    const expenseAmount = Math.abs(tx.amount);
    summary.total_expenses += expenseAmount;
    summary.expense_count += 1;
    summary.expenses_by_category[tx.category] = Number(
      (summary.expenses_by_category[tx.category] || 0) + expenseAmount,
    );

    const merchant = tx.description.substring(0, 50);
    if (!merchantMap[merchant]) {
      merchantMap[merchant] = { amount: 0, count: 0 };
    }
    merchantMap[merchant].amount += expenseAmount;
    merchantMap[merchant].count += 1;
  }

  summary.top_merchants = Object.entries(merchantMap)
    .map(([name, stats]) => ({ name, amount: stats.amount, count: stats.count }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  summary.total_income = Number(summary.total_income.toFixed(2));
  summary.total_expenses = Number(summary.total_expenses.toFixed(2));

  return summary;
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const documentId = params.id;
  const adminSupabase = createSupabaseAdminClient();

  try {
    const forceReprocess =
      request.nextUrl.searchParams.get('force') === 'true' ||
      request.headers.get('x-force-reprocess') === '1';
    const internalSecret = request.headers.get('x-internal-secret');
    const configuredSecret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const isInternalCall = Boolean(configuredSecret && internalSecret === configuredSecret);

    const { data: document, error: documentError } = await adminSupabase
      .from('nova_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (documentError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (!isInternalCall) {
      const supabase = createRouteHandlerSupabaseClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user || user.id !== document.user_id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    if (
      !forceReprocess &&
      document.processing_status === 'completed' &&
      document.processed_at &&
      Number(document.transaction_count || 0) > 0
    ) {
      return NextResponse.json({
        success: true,
        alreadyProcessed: true,
        analysisId: null,
        insightCount: 0,
        goalCount: 0,
      });
    }

    await adminSupabase
      .from('nova_documents')
      .update({ processing_status: 'processing', processing_error: null })
      .eq('id', documentId);

    const novaService = new NovaStorageService(document.user_id);
    const fileBlob = await novaService.downloadDocument(
      document.nova_document_id,
      document.nova_encryption_key_id,
    );

    const file = new File([fileBlob], document.file_name, {
      type: document.mime_type || 'text/csv',
    });

    const nearAI = new NEARAIService();
    let parseResult: ParseResult;
    const [{ data: extractionProfile }, { data: extractionOnboarding }] = await Promise.all([
      adminSupabase.from('user_profiles').select('currency').eq('user_id', document.user_id).maybeSingle(),
      adminSupabase
        .from('onboarding_data')
        .select('data_of_user')
        .eq('user_id', document.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const extractionCurrency = String(
      extractionProfile?.currency || extractionOnboarding?.data_of_user?.currency || 'USD',
    ).toUpperCase();

    if (isPdfStatement(file)) {
      const sourceChunks = await extractPdfTextChunks(file, 2000);
      if (sourceChunks.length === 0) {
        throw new Error(
          'No readable text extracted from PDF. Upload a searchable PDF or export CSV/XLSX for best results.',
        );
      }
      let llmTransactions: ParsedTransaction[] = [];

      try {
        const llmExtracted = await nearAI.extractTransactionsFromPDFChunks({
          chunks: sourceChunks,
          currency: extractionCurrency,
          metadata: {
            fileName: document.file_name,
            accountName: document.account_name,
            statementPeriodStart: document.statement_period_start,
            statementPeriodEnd: document.statement_period_end,
            documentType: document.document_type,
          },
        });

        llmTransactions = llmExtracted.transactions.map((tx) => ({
          date: tx.date,
          description: tx.description,
          amount: Number(tx.amount),
          category: tx.category || (tx.amount > 0 ? 'income_other' : 'other'),
        }));
      } catch (llmExtractionError) {
        console.error('LLM PDF extraction failed, falling back to deterministic parser', llmExtractionError);
      }

      if (llmTransactions.length > 0) {
        parseResult = buildParseResultFromTransactions(llmTransactions, sourceChunks);
      } else {
        try {
          const fallbackParsed = await parseBankStatement(file);
          parseResult = buildParseResultFromTransactions(
            fallbackParsed.transactions,
            fallbackParsed.sourceChunks && fallbackParsed.sourceChunks.length > 0
              ? fallbackParsed.sourceChunks
              : sourceChunks,
          );
        } catch (fallbackError: any) {
          throw new Error(
            `No valid transaction rows were found in PDF after LLM extraction and fallback parsing. ${
              fallbackError?.message || ''
            }`.trim(),
          );
        }
      }
    } else {
      parseResult = await parseBankStatement(file);
      parseResult = buildParseResultFromTransactions(parseResult.transactions, parseResult.sourceChunks || []);
    }

    const monthlySummaries = groupTransactionsByMonth(parseResult.transactions);
    const transactionsByMonth = buildTransactionsByMonth(parseResult.transactions, documentId);

    await adminSupabase
      .from('nova_documents')
      .update({
        statement_period_start: parseResult.dateRange.start,
        statement_period_end: parseResult.dateRange.end,
        date_range_start: parseResult.dateRange.start,
        date_range_end: parseResult.dateRange.end,
      })
      .eq('id', documentId);

    const monthKeys = Object.keys(monthlySummaries);
    const existingSummariesByMonth = new Map<string, any>();

    if (monthKeys.length > 0) {
      const { data: existingMonthRows, error: existingMonthError } = await adminSupabase
        .from('transaction_summaries')
        .select(
          'id,summary_month,total_income,income_count,income_by_source,total_expenses,expense_count,expenses_by_category,top_merchants,all_transactions',
        )
        .eq('user_id', document.user_id)
        .in('summary_month', monthKeys);

      if (existingMonthError) throw existingMonthError;

      for (const row of existingMonthRows || []) {
        existingSummariesByMonth.set(String(row.summary_month), row);
      }
    }

    const monthRowsToUpsert = Object.keys(monthlySummaries).map((month) => {
      const existing = existingSummariesByMonth.get(month);
      const mergedTransactions = mergeAllTransactions(
        existing?.all_transactions,
        transactionsByMonth[month] || [],
        documentId,
      );
      const recalculatedSummary = summarizeTransactions(mergedTransactions);
      const mergedRow = {
        user_id: document.user_id,
        document_id: documentId,
        summary_month: month,
        total_income: clampNumeric12(recalculatedSummary.total_income),
        income_count: recalculatedSummary.income_count,
        income_by_source: recalculatedSummary.income_by_source,
        total_expenses: clampNumeric12(recalculatedSummary.total_expenses),
        expense_count: recalculatedSummary.expense_count,
        expenses_by_category: recalculatedSummary.expenses_by_category,
        top_merchants: recalculatedSummary.top_merchants,
        all_transactions: mergedTransactions,
      };
      return mergedRow;
    });

    await Promise.all(
      monthRowsToUpsert.map(async (mergedRow) => {
        const { error: upsertError } = await adminSupabase.from('transaction_summaries').upsert(
          mergedRow,
          {
            onConflict: 'user_id,summary_month',
          },
        );

        if (upsertError) throw upsertError;
      }),
    );

    const [
      { data: userProfile },
      { data: financialData },
      { data: allMonthlySummaryRows, error: monthlyError },
      { data: onboardingRow, error: onboardingError },
    ] = await Promise.all([
      adminSupabase.from('user_profiles').select('*').eq('user_id', document.user_id).maybeSingle(),
      adminSupabase.from('financial_data').select('*').eq('user_id', document.user_id).maybeSingle(),
      adminSupabase
        .from('transaction_summaries')
        .select(
          'summary_month,total_income,income_count,income_by_source,total_expenses,expense_count,expenses_by_category,top_merchants',
        )
        .eq('user_id', document.user_id)
        .order('summary_month', { ascending: false })
        .limit(12),
      adminSupabase
        .from('onboarding_data')
        .select('data_of_user')
        .eq('user_id', document.user_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (monthlyError) throw monthlyError;
    if (onboardingError) throw onboardingError;

    const preferredCurrency = String(
      userProfile?.currency || onboardingRow?.data_of_user?.currency || 'USD',
    ).toUpperCase();
    const effectiveUserProfile = {
      ...(userProfile || {}),
      currency: preferredCurrency,
    };

    const combinedMonthlySummaries =
      allMonthlySummaryRows && allMonthlySummaryRows.length > 0
        ? buildCombinedMonthlySummaries(allMonthlySummaryRows)
        : monthlySummaries;

    const sourceChunks = parseResult.sourceChunks || [];

    let aiResult: any;
    let optimizationResult: any;
    let goalsResult: any;

    try {
      aiResult = await nearAI.analyzeTransactions({
        userId: document.user_id,
        monthlySummaries: combinedMonthlySummaries,
        userProfile: effectiveUserProfile,
        financialData,
        documentChunks: sourceChunks,
      });
    } catch (aiError) {
      console.error('NEAR AI analysis failed, using fallback analysis', aiError);
      aiResult = {
        analysis: buildFallbackAnalysis(combinedMonthlySummaries, financialData),
        attestation: null,
        requestId: null,
      };
    }

    try {
      optimizationResult = await nearAI.generateOptimizationInsights({
        userId: document.user_id,
        analysis: aiResult.analysis,
        userProfile: effectiveUserProfile,
        financialData,
        monthlySummaries: combinedMonthlySummaries,
        documentChunks: sourceChunks,
      });
    } catch (optimizationError) {
      console.error('NEAR AI optimization failed, using fallback insights', optimizationError);
      optimizationResult = {
        insights: buildFallbackInsights(aiResult.analysis),
        attestation: null,
        requestId: null,
      };
    }

    try {
      goalsResult = await nearAI.generateGoals({
        userId: document.user_id,
        analysis: aiResult.analysis,
        insights: optimizationResult.insights || [],
        userProfile: effectiveUserProfile,
        financialData,
        monthlySummaries: combinedMonthlySummaries,
        documentChunks: sourceChunks,
      });
    } catch (goalsError) {
      console.error('NEAR AI goals failed, using fallback goals', goalsError);
      goalsResult = {
        goals: buildFallbackGoals(aiResult.analysis),
        attestation: null,
        requestId: null,
      };
    }

    const { data: analysis, error: analysisInsertError } = await adminSupabase
      .from('ai_analyses')
      .insert({
        user_id: document.user_id,
        analysis_type: 'comprehensive',
        tee_attestation_id: aiResult.attestation?.id || `fallback-${Date.now()}`,
        near_ai_request_id: aiResult.requestId,
        processed_in_tee: Boolean(aiResult.attestation),
        attestation_verified: Boolean(aiResult.attestation?.verified),
        analysis_summary: JSON.stringify(aiResult.analysis?.overall || {}),
        detailed_breakdown: aiResult.analysis,
        model_used: 'deepseek-ai/DeepSeek-V3.1',
      })
      .select()
      .single();

    if (analysisInsertError || !analysis) {
      throw analysisInsertError || new Error('Failed to persist analysis');
    }

    const insightsToInsert = (optimizationResult.insights || []).map((insight: any) => ({
      user_id: document.user_id,
      analysis_id: analysis.id,
      category: insight.category || 'cashflow',
      title: insight.title || 'Financial optimization recommendation',
      description: insight.description || 'Review this recommendation to improve your finances.',
      potential_savings: toNullableNumeric12(insight.potentialSavings),
      potential_earnings: toNullableNumeric12(insight.potentialEarnings),
      impact_level: insight.impactLevel || 'medium',
      action_required: Array.isArray(insight.actionSteps)
        ? insight.actionSteps.join('\n')
        : insight.action_required || null,
      complexity: insight.complexity || 'medium',
      estimated_time: insight.estimatedTime || null,
      status: 'new',
    }));

    if (insightsToInsert.length > 0) {
      const { error: insightError } = await adminSupabase.from('insights').insert(insightsToInsert);
      if (insightError) throw insightError;
    }

    const { data: existingGoals, error: existingGoalsError } = await adminSupabase
      .from('goals')
      .select('name')
      .eq('user_id', document.user_id);

    if (existingGoalsError) throw existingGoalsError;

    const minimumTotalGoalCount = 5;
    const minimumNewGoalsNeeded = Math.max(minimumTotalGoalCount - (existingGoals || []).length, 0);
    const llmGoalCandidates = Array.isArray(goalsResult.goals) ? goalsResult.goals : [];
    const goalCandidates = [...llmGoalCandidates, ...buildFallbackGoals(aiResult.analysis)];
    const seenGoalNames = new Set((existingGoals || []).map((goal: any) => normalizeGoalName(goal.name || '')));
    const goalsToInsert: any[] = [];

    for (const rawGoal of goalCandidates) {
      const name = String(rawGoal?.name || '')
        .trim()
        .slice(0, 80);
      if (!name) continue;

      const normalizedName = normalizeGoalName(name);
      if (seenGoalNames.has(normalizedName)) continue;

      const targetAmount = clampNumeric12(
        toNonNegativeNumber(rawGoal?.targetAmount ?? rawGoal?.target_amount, 0),
      );
      if (targetAmount <= 0) continue;

      const currentAmountRaw = clampNumeric12(
        toNonNegativeNumber(rawGoal?.currentAmount ?? rawGoal?.current_amount, 0),
      );
      const currentAmount = Math.min(currentAmountRaw, targetAmount);

      const description = String(rawGoal?.description || '')
        .trim()
        .slice(0, 2000);
      const category = normalizeGoalCategory(rawGoal?.category);
      const targetDate = toGoalDate(rawGoal?.targetDate ?? rawGoal?.target_date);
      const monthlyContributionRaw = rawGoal?.monthlyContribution ?? rawGoal?.monthly_contribution;
      const monthlyContribution =
        monthlyContributionRaw === null || monthlyContributionRaw === undefined
          ? null
          : clampNumeric12(toNonNegativeNumber(monthlyContributionRaw, 0));

      const parsedPriority = Math.round(Number(rawGoal?.priority));
      const priority = Number.isFinite(parsedPriority)
        ? Math.min(Math.max(parsedPriority, 1), 5)
        : 3;

      goalsToInsert.push({
        user_id: document.user_id,
        name,
        description: description || null,
        category,
        target_amount: Number(targetAmount.toFixed(2)),
        current_amount: Number(currentAmount.toFixed(2)),
        target_date: targetDate,
        monthly_contribution: monthlyContribution === null ? null : Number(monthlyContribution.toFixed(2)),
        priority,
        status: 'active',
      });

      seenGoalNames.add(normalizedName);

      if (goalsToInsert.length >= 6) break;
    }

    if (goalsToInsert.length < minimumNewGoalsNeeded) {
      console.warn('Goal generation produced fewer unique goals than expected minimum', {
        existingGoalCount: (existingGoals || []).length,
        minimumNewGoalsNeeded,
        insertedGoals: goalsToInsert.length,
      });
    }

    if (goalsToInsert.length > 0) {
      const { error: goalsInsertError } = await adminSupabase.from('goals').insert(goalsToInsert);
      if (goalsInsertError) throw goalsInsertError;
    }

    await adminSupabase
      .from('nova_documents')
      .update({
        processing_status: 'completed',
        processed_at: new Date().toISOString(),
        transaction_count: parseResult.transactions.length,
        date_range_start: parseResult.dateRange.start,
        date_range_end: parseResult.dateRange.end,
        total_income: clampNumeric12(parseResult.totalIncome),
        total_expenses: clampNumeric12(parseResult.totalExpenses),
      })
      .eq('id', documentId);

    return NextResponse.json({
      success: true,
      analysisId: analysis.id,
      insightCount: insightsToInsert.length,
      goalCount: goalsToInsert.length,
    });
  } catch (error: any) {
    console.error('Processing error', error);

    await adminSupabase
      .from('nova_documents')
      .update({
        processing_status: 'failed',
        processing_error: error.message || 'Processing failed',
      })
      .eq('id', documentId);

    return NextResponse.json({ error: error.message || 'Processing failed' }, { status: 500 });
  }
}
