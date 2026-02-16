'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { ALL_COUNTRY_OPTIONS, ALL_CURRENCY_OPTIONS, getIncomeRangeOptions } from '@/lib/utils/onboarding';

interface OnboardingData {
  fullName?: string;
  countryCode?: string;
  currency?: string;
  employmentType?: string;
  monthlyIncomeEstimate?: number;
  monthlyExpensesEstimate?: number;
  annualIncomeRange?: string;
  riskTolerance?: number;
  primaryGoals?: string[];
}

interface OnboardingStatusResponse {
  onboardingData: {
    created_at: string;
    data_of_user?: OnboardingData;
  } | null;
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

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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
  const [primaryGoalsInput, setPrimaryGoalsInput] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');

  const incomeRangeOptions = useMemo(() => getIncomeRangeOptions(currency), [currency]);

  const parsedGoals = useMemo(
    () =>
      primaryGoalsInput
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    [primaryGoalsInput],
  );

  useEffect(() => {
    if (!incomeRangeOptions.includes(annualIncomeRange)) {
      setAnnualIncomeRange(incomeRangeOptions[2] || incomeRangeOptions[0]);
    }
  }, [annualIncomeRange, incomeRangeOptions]);

  useEffect(() => {
    let canceled = false;

    async function loadOnboardingData() {
      try {
        const response = await fetch('/api/onboarding', { cache: 'no-store' });
        const payload = (await response.json()) as OnboardingStatusResponse & { error?: string };

        if (!response.ok) {
          throw new Error(payload.error || 'Failed to load onboarding data');
        }

        if (canceled) return;

        const existing = payload.onboardingData?.data_of_user;
        if (payload.onboardingData?.created_at) {
          setLastUpdated(payload.onboardingData.created_at);
        }

        if (!existing) return;

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
      } catch (loadError: any) {
        if (!canceled) {
          setError(loadError.message || 'Failed to load onboarding data');
        }
      } finally {
        if (!canceled) {
          setLoading(false);
        }
      }
    }

    loadOnboardingData();

    return () => {
      canceled = true;
    };
  }, []);

  const handleSave = async (event: React.FormEvent) => {
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
    setSuccess('');

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

      setLastUpdated(new Date().toISOString());
      setSuccess('Onboarding profile updated successfully.');
    } catch (saveError: any) {
      setError(saveError.message || 'Failed to save onboarding data');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-gray-500">Manage your profile, onboarding data, privacy, and integrations.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Onboarding Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lastUpdated ? (
            <p className="text-xs text-gray-500">
              Last updated: {new Date(lastUpdated).toLocaleString()}
            </p>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {success ? (
            <Alert>
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          ) : null}

          <form className="space-y-4" onSubmit={handleSave}>
            <div className="space-y-2">
              <Label htmlFor="settings-full-name">Full Name (shown in sidebar)</Label>
              <Input
                id="settings-full-name"
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
                <Label htmlFor="settings-monthly-income">Estimated Monthly Income</Label>
                <Input
                  id="settings-monthly-income"
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
                <Label htmlFor="settings-monthly-expenses">Estimated Monthly Expenses</Label>
                <Input
                  id="settings-monthly-expenses"
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
                <Label htmlFor="settings-risk-tolerance">Risk Tolerance (1-10)</Label>
                <Input
                  id="settings-risk-tolerance"
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
              <Label htmlFor="settings-primary-goals">Primary Goals (comma separated)</Label>
              <Input
                id="settings-primary-goals"
                value={primaryGoalsInput}
                onChange={(event) => setPrimaryGoalsInput(event.target.value)}
                placeholder="Build emergency fund, Save for home"
                disabled={saving}
              />
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save onboarding data
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy Defaults</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-gray-700">
          <p>Raw transactions are processed in secure enclaves and are not persisted after summarization.</p>
          <p>Nova documents can be deleted at any time from the Transactions page.</p>
          <p>RLS policies ensure users only access their own records.</p>
        </CardContent>
      </Card>
    </div>
  );
}
