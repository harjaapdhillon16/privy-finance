import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { NEARAIService } from '@/lib/near-ai/client';

export const dynamic = 'force-dynamic';

const allowedGoalCategories = new Set([
  'savings',
  'debt',
  'investing',
  'emergency_fund',
  'income',
  'retirement',
  'other',
]);

const createGoalSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(2000).nullable().optional(),
  category: z.string().trim().min(2).max(60).optional(),
  targetAmount: z.coerce.number().positive(),
  currentAmount: z.coerce.number().min(0).optional(),
  targetDate: z.string().trim().nullable().optional(),
  monthlyContribution: z.coerce.number().min(0).nullable().optional(),
  priority: z.coerce.number().int().min(1).max(5).optional(),
});

const requestSchema = z
  .object({
    goalId: z.string().uuid().optional(),
    createGoal: z.boolean().optional(),
    saveAsInsight: z.boolean().optional(),
    goal: createGoalSchema.optional(),
  })
  .refine((value) => Boolean(value.goalId) || Boolean(value.goal), {
    message: 'Either goalId or goal payload is required',
  });

function toNumber(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeCategory(value: string | null | undefined) {
  const normalized = String(value || 'other')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
  return allowedGoalCategories.has(normalized) ? normalized : 'other';
}

function normalizeDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split('T')[0];
}

function buildMonthlySummariesMap(rows: any[]) {
  return rows.reduce(
    (acc, row) => {
      const key = String(row.summary_month);
      acc[key] = {
        total_income: toNumber(row.total_income),
        total_expenses: toNumber(row.total_expenses),
        income_count: toNumber(row.income_count),
        expense_count: toNumber(row.expense_count),
        expenses_by_category: row.expenses_by_category || {},
      };
      return acc;
    },
    {} as Record<string, any>,
  );
}

function buildFallbackPlan(goal: {
  name: string;
  targetAmount: number;
  currentAmount: number;
  monthlyContribution: number;
}) {
  const remaining = Math.max(goal.targetAmount - goal.currentAmount, 0);
  const monthly = Math.max(goal.monthlyContribution || 0, remaining > 0 ? remaining / 12 : 0);
  const monthsNeeded = monthly > 0 ? Math.ceil(remaining / monthly) : 0;

  return {
    summary: `Set a recurring contribution of ${monthly.toFixed(
      2,
    )} per month and review progress each month.`,
    monthlyMilestones: Array.from({ length: Math.min(Math.max(monthsNeeded, 6), 12) }, (_, index) => {
      const monthDate = new Date();
      monthDate.setMonth(monthDate.getMonth() + index + 1);
      const targetAmount = Math.min(goal.currentAmount + monthly * (index + 1), goal.targetAmount);

      return {
        month: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, '0')}`,
        targetAmount: Number(targetAmount.toFixed(2)),
        why: 'Stay on track with a predictable monthly contribution cadence.',
      };
    }),
    actionPlan: [
      { step: 'Set up an automatic monthly transfer to this goal.', timeline: 'This week', estimatedImpact: monthly },
      { step: 'Cut one discretionary expense category by 10%.', timeline: 'Next 30 days', estimatedImpact: null },
      { step: 'Review progress and adjust contribution monthly.', timeline: 'Every month', estimatedImpact: null },
      { step: 'Redirect unexpected income (bonuses/refunds) to this goal.', timeline: 'As income arrives', estimatedImpact: null },
    ],
    budgetAdjustments: [
      {
        category: 'discretionary_spending',
        currentMonthly: null,
        recommendedMonthly: null,
        delta: -monthly,
        reason: 'Reallocate this amount toward the goal contribution.',
      },
    ],
    incomeIdeas: ['Allocate side-income or annual bonus toward the goal.'],
    riskMitigations: ['Keep contributions realistic to avoid plan abandonment.'],
    trackingMetrics: ['Monthly contribution', 'Remaining amount', 'Projected completion month'],
  };
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

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || 'Invalid payload' },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const shouldCreateGoal = payload.createGoal !== false;
    const shouldSaveInsight = payload.saveAsInsight !== false;

    let goalRecord: any = null;

    if (payload.goalId) {
      const { data: existingGoal, error: existingGoalError } = await supabase
        .from('goals')
        .select('*')
        .eq('id', payload.goalId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingGoalError) throw existingGoalError;
      if (!existingGoal) {
        return NextResponse.json({ error: 'Goal not found' }, { status: 404 });
      }

      goalRecord = existingGoal;
    } else if (payload.goal) {
      const normalizedGoal = {
        name: payload.goal.name.trim(),
        description: payload.goal.description?.trim() || null,
        category: normalizeCategory(payload.goal.category),
        target_amount: payload.goal.targetAmount,
        current_amount: Math.min(toNumber(payload.goal.currentAmount), payload.goal.targetAmount),
        target_date: normalizeDate(payload.goal.targetDate),
        monthly_contribution:
          payload.goal.monthlyContribution === null || payload.goal.monthlyContribution === undefined
            ? null
            : toNumber(payload.goal.monthlyContribution),
        priority: payload.goal.priority || 3,
      };

      if (shouldCreateGoal) {
        const { data: createdGoal, error: createGoalError } = await supabase
          .from('goals')
          .insert({
            user_id: user.id,
            ...normalizedGoal,
            status: 'active',
          })
          .select('*')
          .single();

        if (createGoalError) throw createGoalError;
        goalRecord = createdGoal;
      } else {
        goalRecord = {
          id: null,
          user_id: user.id,
          ...normalizedGoal,
        };
      }
    }

    if (!goalRecord) {
      return NextResponse.json({ error: 'Unable to resolve goal context' }, { status: 400 });
    }

    const [
      { data: userProfile, error: profileError },
      { data: financialData, error: financialError },
      { data: summaryRows, error: summariesError },
      { data: analysisRow, error: analysisError },
      { data: existingInsights, error: insightsError },
      { data: onboardingRow, error: onboardingError },
    ] = await Promise.all([
      supabase.from('user_profiles').select('*').eq('user_id', user.id).maybeSingle(),
      supabase.from('financial_data').select('*').eq('user_id', user.id).maybeSingle(),
      supabase
        .from('transaction_summaries')
        .select('summary_month,total_income,total_expenses,income_count,expense_count,expenses_by_category')
        .eq('user_id', user.id)
        .order('summary_month', { ascending: false })
        .limit(12),
      supabase
        .from('ai_analyses')
        .select('detailed_breakdown,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('insights')
        .select('title,description,category,impact_level,potential_savings,potential_earnings')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('onboarding_data')
        .select('data_of_user')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileError) throw profileError;
    if (financialError) throw financialError;
    if (summariesError) throw summariesError;
    if (analysisError) throw analysisError;
    if (insightsError) throw insightsError;
    if (onboardingError) throw onboardingError;

    const preferredCurrency = String(
      userProfile?.currency || onboardingRow?.data_of_user?.currency || 'USD',
    ).toUpperCase();
    const effectiveProfile = {
      ...(userProfile || {}),
      currency: preferredCurrency,
    };

    const planningGoal = {
      name: String(goalRecord.name || ''),
      description: goalRecord.description || '',
      category: String(goalRecord.category || 'other'),
      targetAmount: toNumber(goalRecord.target_amount),
      currentAmount: toNumber(goalRecord.current_amount),
      targetDate: goalRecord.target_date || null,
      monthlyContribution: goalRecord.monthly_contribution === null ? null : toNumber(goalRecord.monthly_contribution),
      priority: toNumber(goalRecord.priority || 3),
    };

    let plan: any;
    let requestId: string | null = null;

    try {
      const nearAI = new NEARAIService();
      const aiPlanResult = await nearAI.generateGoalExecutionPlan({
        goal: planningGoal,
        userProfile: effectiveProfile,
        financialData,
        monthlySummaries: buildMonthlySummariesMap(summaryRows || []),
        analysis: analysisRow?.detailed_breakdown || null,
        existingInsights: existingInsights || [],
      });

      plan = aiPlanResult.plan || {};
      requestId = aiPlanResult.requestId || null;
    } catch (llmError) {
      console.error('Goal execution plan generation failed, using fallback', llmError);
      plan = buildFallbackPlan({
        name: planningGoal.name,
        targetAmount: planningGoal.targetAmount,
        currentAmount: planningGoal.currentAmount,
        monthlyContribution: planningGoal.monthlyContribution || 0,
      });
    }

    let savedInsightId: string | null = null;

    if (shouldSaveInsight) {
      const actionPlanLines = Array.isArray(plan?.actionPlan)
        ? plan.actionPlan
            .map((item: any) =>
              [String(item?.timeline || '').trim(), String(item?.step || '').trim()]
                .filter(Boolean)
                .join(': '),
            )
            .filter(Boolean)
        : [];

      const monthlySavingsEstimate = Array.isArray(plan?.budgetAdjustments)
        ? plan.budgetAdjustments.reduce((sum: number, item: any) => {
            const delta = toNumber(item?.delta);
            return delta < 0 ? sum + Math.abs(delta) : sum;
          }, 0)
        : 0;

      const priority = toNumber(planningGoal.priority || 3);
      const impactLevel = priority <= 1 ? 'critical' : priority <= 2 ? 'high' : priority <= 3 ? 'medium' : 'low';

      const { data: insertedInsight, error: insertInsightError } = await supabase
        .from('insights')
        .insert({
          user_id: user.id,
          category: 'goal_strategy',
          title: `Goal Plan: ${planningGoal.name}`,
          description:
            String(plan?.summary || '').trim() ||
            `AI-generated execution plan for ${planningGoal.name}.`,
          potential_savings: monthlySavingsEstimate > 0 ? Number((monthlySavingsEstimate * 12).toFixed(2)) : null,
          impact_level: impactLevel,
          action_required: actionPlanLines.join('\n'),
          complexity: 'medium',
          estimated_time: planningGoal.targetDate ? `By ${planningGoal.targetDate}` : null,
          status: 'new',
        })
        .select('id')
        .single();

      if (insertInsightError) throw insertInsightError;
      savedInsightId = insertedInsight?.id || null;
    }

    return NextResponse.json({
      success: true,
      requestId,
      goal: goalRecord,
      plan,
      savedInsightId,
    });
  } catch (error: any) {
    console.error('Goal plan generation error', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate goal execution plan' },
      { status: 500 },
    );
  }
}
