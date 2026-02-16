import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { deriveIncomeRangeFromMonthlyEstimate, getIncomeRangeOptions } from '@/lib/utils/onboarding';

export const dynamic = 'force-dynamic';

const onboardingSchema = z.object({
  fullName: z.string().trim().min(1).max(120).optional(),
  countryCode: z.string().trim().min(2).max(3),
  currency: z.string().trim().min(3).max(5),
  employmentType: z.enum([
    'full_time',
    'part_time',
    'self_employed',
    'student',
    'unemployed',
    'retired',
    'other',
  ]),
  monthlyIncomeEstimate: z.coerce.number().positive(),
  monthlyExpensesEstimate: z.coerce.number().min(0),
  annualIncomeRange: z.string().trim().min(1).max(120).optional(),
  riskTolerance: z.coerce.number().int().min(1).max(10).optional(),
  primaryGoals: z.array(z.string().trim().min(1).max(100)).max(10).optional(),
});

export async function GET() {
  try {
    const supabase = createRouteHandlerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [{ data: userRow }, { data: onboardingRows, error: onboardingError }] = await Promise.all([
      supabase
        .from('users')
        .select('id,onboarding_completed')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('onboarding_data')
        .select('id,created_at,data_of_user,user_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    if (onboardingError) {
      throw onboardingError;
    }

    const onboardingData = onboardingRows?.[0] || null;
    const onboardingCompleted = Boolean(userRow?.onboarding_completed);

    return NextResponse.json({
      onboardingCompleted,
      onboardingData,
      needsOnboarding: !onboardingCompleted || !onboardingData,
    });
  } catch (error: any) {
    console.error('Get onboarding status error', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get onboarding status' },
      { status: 500 },
    );
  }
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

    const body = await request.json();
    const parsed = onboardingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.errors[0]?.message || 'Invalid onboarding payload',
        },
        { status: 400 },
      );
    }

    const payload = parsed.data;
    const normalizedCurrency = payload.currency.toUpperCase();
    const rangeOptions = getIncomeRangeOptions(normalizedCurrency);
    const annualIncomeRange =
      payload.annualIncomeRange && rangeOptions.includes(payload.annualIncomeRange)
        ? payload.annualIncomeRange
        : deriveIncomeRangeFromMonthlyEstimate(payload.monthlyIncomeEstimate, normalizedCurrency);
    const primaryGoals = payload.primaryGoals || [];

    const dataOfUser = {
      fullName: payload.fullName,
      countryCode: payload.countryCode.toUpperCase(),
      currency: normalizedCurrency,
      employmentType: payload.employmentType,
      monthlyIncomeEstimate: payload.monthlyIncomeEstimate,
      monthlyExpensesEstimate: payload.monthlyExpensesEstimate,
      annualIncomeRange,
      riskTolerance: payload.riskTolerance,
      primaryGoals,
      completedAt: new Date().toISOString(),
    };

    const { data: existingRows, error: existingError } = await supabase
      .from('onboarding_data')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (existingError) {
      throw existingError;
    }

    const existingId = existingRows?.[0]?.id;

    if (existingId) {
      const { error: updateOnboardingError } = await supabase
        .from('onboarding_data')
        .update({
          data_of_user: dataOfUser,
        })
        .eq('id', existingId)
        .eq('user_id', user.id);

      if (updateOnboardingError) throw updateOnboardingError;
    } else {
      const { error: insertOnboardingError } = await supabase.from('onboarding_data').insert({
        user_id: user.id,
        data_of_user: dataOfUser,
      });

      if (insertOnboardingError) throw insertOnboardingError;
    }

    const usersUpdates: Record<string, any> = {
      onboarding_completed: true,
    };

    if (payload.fullName) {
      usersUpdates.full_name = payload.fullName;
    }

    const { error: usersUpdateError } = await supabase
      .from('users')
      .update(usersUpdates)
      .eq('id', user.id);

    if (usersUpdateError) throw usersUpdateError;

    const { error: profileUpsertError } = await supabase.from('user_profiles').upsert(
      {
        user_id: user.id,
        country_code: payload.countryCode.toUpperCase(),
        currency: normalizedCurrency,
        employment_type: payload.employmentType,
        annual_income_range: annualIncomeRange,
        risk_tolerance: payload.riskTolerance,
        primary_goals: primaryGoals,
      },
      { onConflict: 'user_id' },
    );

    if (profileUpsertError) throw profileUpsertError;

    const { error: financialUpsertError } = await supabase.from('financial_data').upsert(
      {
        user_id: user.id,
        monthly_income: payload.monthlyIncomeEstimate,
        total_monthly_expenses: payload.monthlyExpensesEstimate,
        monthly_expenses: {
          estimated_total: payload.monthlyExpensesEstimate,
          captured_from_onboarding: true,
        },
      },
      { onConflict: 'user_id' },
    );

    if (financialUpsertError) throw financialUpsertError;

    return NextResponse.json({
      success: true,
      onboardingCompleted: true,
      data: dataOfUser,
    });
  } catch (error: any) {
    console.error('Save onboarding error', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save onboarding data' },
      { status: 500 },
    );
  }
}
