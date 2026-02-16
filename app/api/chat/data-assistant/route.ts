import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { NEARAIService } from '@/lib/near-ai/client';

export const dynamic = 'force-dynamic';

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(5000),
});

const requestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(40),
});

function toNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function extractResponseText(response: any) {
  if (Array.isArray(response?.content) && response.content.length > 0) {
    const fromContent = response.content
      .map((item: any) => item?.text || '')
      .join('')
      .trim();
    if (fromContent) return fromContent;
  }

  if (Array.isArray(response?.choices) && response.choices.length > 0) {
    const choice = response.choices[0];
    const messageContent = choice?.message?.content;

    if (typeof messageContent === 'string' && messageContent.trim()) {
      return messageContent.trim();
    }

    if (Array.isArray(messageContent)) {
      const joined = messageContent
        .map((part: any) => part?.text || '')
        .join('')
        .trim();
      if (joined) return joined;
    }

    if (typeof choice?.text === 'string' && choice.text.trim()) {
      return choice.text.trim();
    }
  }

  return '';
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

function buildSystemPrompt() {
  return `You are Privy Finance's "Talk To My Data" assistant.

You answer based on provided USER DATA CONTEXT and conversation history.
Rules:
- Prioritize factual answers from context. If data is missing, say so clearly.
- Use concise, practical guidance with exact numbers when possible.
- Use the user's currency from context for all money values.
- Do not invent transactions, goals, insights, or profile fields.
- If user asks for strategy, provide step-by-step actions grounded in their data.
- Keep answers clear for non-experts and include a short "Why this matters" line when relevant.`;
}

function buildContextPrompt(context: any) {
  return `USER DATA CONTEXT (JSON):
${JSON.stringify(context, null, 2)}

Use this context as your source of truth for this conversation.`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawBody = await request.json();
    const parsed = requestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.errors[0]?.message || 'Invalid request body',
        },
        { status: 400 },
      );
    }

    const incomingMessages = parsed.data.messages
      .slice(-24)
      .map((message) => ({
        role: message.role,
        content: message.content.trim(),
      }))
      .filter((message) => message.content.length > 0);

    if (incomingMessages.length === 0) {
      return NextResponse.json({ error: 'No valid chat messages provided' }, { status: 400 });
    }

    const [
      { data: summaries, error: summariesError },
      { data: onboardingRows, error: onboardingError },
      { data: insights, error: insightsError },
      { data: goals, error: goalsError },
      { data: profile, error: profileError },
    ] = await Promise.all([
      supabase
        .from('transaction_summaries')
        .select(
          'summary_month,total_income,total_expenses,income_count,expense_count,income_by_source,expenses_by_category,top_merchants,all_transactions',
        )
        .eq('user_id', user.id)
        .order('summary_month', { ascending: false })
        .limit(12),
      supabase
        .from('onboarding_data')
        .select('data_of_user,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1),
      supabase
        .from('insights')
        .select('id,category,title,description,potential_savings,potential_earnings,impact_level,status,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(60),
      supabase
        .from('goals')
        .select('id,name,description,category,target_amount,current_amount,target_date,monthly_contribution,status,priority,progress_percentage,created_at,updated_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(60),
      supabase.from('user_profiles').select('currency').eq('user_id', user.id).maybeSingle(),
    ]);

    if (summariesError) throw summariesError;
    if (onboardingError) throw onboardingError;
    if (insightsError) throw insightsError;
    if (goalsError) throw goalsError;
    if (profileError) throw profileError;

    const onboarding = onboardingRows?.[0] || null;
    const fallbackCurrency = String(onboarding?.data_of_user?.currency || '').toUpperCase();
    const currency = String(profile?.currency || fallbackCurrency || 'USD').toUpperCase();

    const summaryRows = (summaries || [])
      .slice()
      .reverse()
      .map((row: any) => ({
        month: String(row.summary_month),
        income: toNumber(row.total_income),
        expenses: toNumber(row.total_expenses),
        net: Number((toNumber(row.total_income) - toNumber(row.total_expenses)).toFixed(2)),
        incomeCount: toNumber(row.income_count),
        expenseCount: toNumber(row.expense_count),
        incomeBySource: row.income_by_source || {},
        expensesByCategory: row.expenses_by_category || {},
        topMerchants: Array.isArray(row.top_merchants) ? row.top_merchants : [],
      }));

    const recentTransactions = (summaries || [])
      .flatMap((row: any) => normalizeTransactions(row.all_transactions, String(row.summary_month)))
      .sort((a, b) => {
        const timeDelta = new Date(b.date).getTime() - new Date(a.date).getTime();
        if (Number.isFinite(timeDelta) && timeDelta !== 0) return timeDelta;
        return Math.abs(b.amount) - Math.abs(a.amount);
      })
      .slice(0, 350);

    const context = {
      currency,
      onboardingData: onboarding?.data_of_user || null,
      transactionSummaries: summaryRows,
      recentTransactions,
      insights: (insights || []).map((insight: any) => ({
        id: insight.id,
        category: insight.category,
        title: insight.title,
        description: insight.description,
        potentialSavings: toNumber(insight.potential_savings),
        potentialEarnings: toNumber(insight.potential_earnings),
        impactLevel: insight.impact_level,
        status: insight.status,
        createdAt: insight.created_at,
      })),
      goals: (goals || []).map((goal: any) => ({
        id: goal.id,
        name: goal.name,
        description: goal.description,
        category: goal.category,
        targetAmount: toNumber(goal.target_amount),
        currentAmount: toNumber(goal.current_amount),
        progressPercentage: toNumber(goal.progress_percentage),
        monthlyContribution: goal.monthly_contribution === null ? null : toNumber(goal.monthly_contribution),
        targetDate: goal.target_date,
        status: goal.status,
        priority: toNumber(goal.priority),
      })),
      contextGeneratedAt: new Date().toISOString(),
    };

    const nearAI = new NEARAIService();
    const response = await nearAI.createCompletion({
      model: 'deepseek-ai/DeepSeek-V3.1',
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildContextPrompt(context) },
        ...incomingMessages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      ],
      max_tokens: 1800,
      temperature: 0.35,
    });

    const assistantReply = extractResponseText(response);
    if (!assistantReply) {
      throw new Error('No response text returned by model');
    }

    return NextResponse.json({
      success: true,
      reply: assistantReply,
      requestId: response.id || null,
      attestationId: response.tee_attestation?.id || null,
      currency,
      contextStats: {
        summaryMonths: summaryRows.length,
        transactions: recentTransactions.length,
        insights: (insights || []).length,
        goals: (goals || []).length,
      },
    });
  } catch (error: any) {
    console.error('Talk To My Data chat error', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process chat request' },
      { status: 500 },
    );
  }
}
