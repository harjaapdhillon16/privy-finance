'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  ALL_COUNTRY_OPTIONS,
  ALL_CURRENCY_OPTIONS,
  getIncomeRangeOptions,
} from '@/lib/utils/onboarding';

interface OnboardingData {
  fullName?: string;
  countryCode: string;
  currency: string;
  employmentType: string;
  monthlyIncomeEstimate: number;
  monthlyExpensesEstimate: number;
  annualIncomeRange?: string;
  riskTolerance?: number;
  primaryGoals: string[];
}

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'self_employed', label: 'Self Employed' },
  { value: 'student', label: 'Student' },
  { value: 'unemployed', label: 'Unemployed' },
  { value: 'retired', label: 'Retired' },
  { value: 'other', label: 'Other' },
];

interface OnboardingStatusResponse {
  needsOnboarding: boolean;
  onboardingCompleted: boolean;
  onboardingData: { data_of_user?: Partial<OnboardingData> } | null;
}

export function OnboardingModal() {
  const [checking, setChecking] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [fullName, setFullName] = useState('');
  const [countryCode, setCountryCode] = useState('US');
  const [currency, setCurrency] = useState('USD');
  const [employmentType, setEmploymentType] = useState('full_time');
  const [monthlyIncomeEstimate, setMonthlyIncomeEstimate] = useState('');
  const [monthlyExpensesEstimate, setMonthlyExpensesEstimate] = useState('');
  const [annualIncomeRange, setAnnualIncomeRange] = useState(
    () => getIncomeRangeOptions('USD')[2],
  );
  const [riskTolerance, setRiskTolerance] = useState('5');
  const [primaryGoalsInput, setPrimaryGoalsInput] = useState('Build emergency fund, Reduce debt');

  useEffect(() => {
    let canceled = false;

    const loadStatus = async () => {
      try {
        const response = await fetch('/api/onboarding', { cache: 'no-store' });
        const payload = (await response.json()) as OnboardingStatusResponse;

        if (!response.ok) {
          throw new Error((payload as any).error || 'Failed to load onboarding state');
        }

        if (canceled) return;

        const existing = payload.onboardingData?.data_of_user;

        if (existing) {
          const resolvedCurrency = (existing.currency || 'USD').toUpperCase();
          const resolvedIncomeRanges = getIncomeRangeOptions(resolvedCurrency);

          setFullName(existing.fullName || '');
          setCountryCode(existing.countryCode || 'US');
          setCurrency(resolvedCurrency);
          setEmploymentType(existing.employmentType || 'full_time');
          setMonthlyIncomeEstimate(String(existing.monthlyIncomeEstimate || ''));
          setMonthlyExpensesEstimate(String(existing.monthlyExpensesEstimate || ''));
          setAnnualIncomeRange(
            existing.annualIncomeRange && resolvedIncomeRanges.includes(existing.annualIncomeRange)
              ? existing.annualIncomeRange
              : resolvedIncomeRanges[2] || resolvedIncomeRanges[0],
          );
          setRiskTolerance(String(existing.riskTolerance || 5));
          setPrimaryGoalsInput((existing.primaryGoals || []).join(', '));
        }

        setOpen(Boolean(payload.needsOnboarding));
      } catch (loadError: any) {
        if (!canceled) {
          setError(loadError.message || 'Failed to load onboarding state');
          setOpen(true);
        }
      } finally {
        if (!canceled) {
          setChecking(false);
        }
      }
    };

    loadStatus();

    return () => {
      canceled = true;
    };
  }, []);

  const parsedGoals = useMemo(
    () =>
      primaryGoalsInput
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    [primaryGoalsInput],
  );

  const incomeRangeOptions = useMemo(() => getIncomeRangeOptions(currency), [currency]);

  useEffect(() => {
    if (!incomeRangeOptions.includes(annualIncomeRange)) {
      setAnnualIncomeRange(incomeRangeOptions[2] || incomeRangeOptions[0]);
    }
  }, [annualIncomeRange, incomeRangeOptions]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const monthlyIncome = Number(monthlyIncomeEstimate);
    const monthlyExpenses = Number(monthlyExpensesEstimate);
    const riskValue = Number(riskTolerance);

    if (Number.isNaN(monthlyIncome) || monthlyIncome <= 0) {
      setError('Estimated monthly income must be greater than 0.');
      return;
    }

    if (Number.isNaN(monthlyExpenses) || monthlyExpenses < 0) {
      setError('Estimated monthly expenses must be 0 or greater.');
      return;
    }

    if (Number.isNaN(riskValue) || riskValue < 1 || riskValue > 10) {
      setError('Risk tolerance must be between 1 and 10.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: fullName || undefined,
          countryCode,
          currency,
          employmentType,
          monthlyIncomeEstimate: monthlyIncome,
          monthlyExpensesEstimate: monthlyExpenses,
          annualIncomeRange,
          riskTolerance: riskValue,
          primaryGoals: parsedGoals,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Failed to save onboarding data');
      }

      setOpen(false);
    } catch (submitError: any) {
      setError(submitError.message || 'Failed to save onboarding data');
    } finally {
      setSaving(false);
    }
  };

  if (checking) {
    return null;
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showClose={false}
        className="max-h-[90vh] overflow-y-auto"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Complete your financial profile</DialogTitle>
          <DialogDescription>
            We use this onboarding data to personalize your dashboard, goals, and AI insights.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive" className="mt-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="onboarding-full-name">Full Name (Optional)</Label>
            <Input
              id="onboarding-full-name"
              value={fullName}
              onChange={(event) => setFullName(event.target.value)}
              placeholder="Your full name"
              disabled={saving}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Country</Label>
              <SearchableSelect
                value={countryCode}
                onValueChange={setCountryCode}
                options={ALL_COUNTRY_OPTIONS}
                searchPlaceholder="Search country..."
                placeholder="Select country"
                disabled={saving}
              />
            </div>

            <div className="space-y-2">
              <Label>Currency</Label>
              <SearchableSelect
                value={currency}
                onValueChange={setCurrency}
                options={ALL_CURRENCY_OPTIONS}
                searchPlaceholder="Search currency code or name..."
                placeholder="Select currency"
                disabled={saving}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Employment Type</Label>
            <Select value={employmentType} onValueChange={setEmploymentType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EMPLOYMENT_TYPES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="monthly-income">Estimated Monthly Income</Label>
              <Input
                id="monthly-income"
                type="number"
                min={0}
                step="0.01"
                value={monthlyIncomeEstimate}
                onChange={(event) => setMonthlyIncomeEstimate(event.target.value)}
                placeholder="5000"
                disabled={saving}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="monthly-expenses">Estimated Monthly Expenses</Label>
              <Input
                id="monthly-expenses"
                type="number"
                min={0}
                step="0.01"
                value={monthlyExpensesEstimate}
                onChange={(event) => setMonthlyExpensesEstimate(event.target.value)}
                placeholder="3200"
                disabled={saving}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Annual Income Range</Label>
              <Select value={annualIncomeRange} onValueChange={setAnnualIncomeRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {incomeRangeOptions.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="risk-tolerance">Risk Tolerance (1-10)</Label>
              <Input
                id="risk-tolerance"
                type="number"
                min={1}
                max={10}
                step={1}
                value={riskTolerance}
                onChange={(event) => setRiskTolerance(event.target.value)}
                disabled={saving}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="primary-goals">Primary Goals (comma separated)</Label>
            <Input
              id="primary-goals"
              value={primaryGoalsInput}
              onChange={(event) => setPrimaryGoalsInput(event.target.value)}
              placeholder="Build emergency fund, Save for home"
              disabled={saving}
            />
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save and continue
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
