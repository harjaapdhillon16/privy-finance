'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface GoalRow {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  target_amount: number;
  current_amount: number;
  target_date?: string | null;
  progress_percentage?: number | null;
  monthly_contribution?: number | null;
  priority?: number | null;
}

interface GoalExecutionPlan {
  summary?: string;
  monthlyMilestones?: Array<{
    month: string;
    targetAmount: number;
    why?: string;
  }>;
  actionPlan?: Array<{
    step: string;
    timeline?: string;
    estimatedImpact?: number | null;
  }>;
  budgetAdjustments?: Array<{
    category: string;
    currentMonthly?: number | null;
    recommendedMonthly?: number | null;
    delta?: number;
    reason?: string;
  }>;
  incomeIdeas?: string[];
  riskMitigations?: string[];
  trackingMetrics?: string[];
}

interface GoalPlanResponse {
  success: boolean;
  requestId?: string | null;
  goal: GoalRow;
  plan: GoalExecutionPlan;
  savedInsightId?: string | null;
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function prettifyLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function GoalsPage() {
  const isClient = typeof window !== 'undefined';
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('savings');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [monthlyContribution, setMonthlyContribution] = useState('');
  const [priority, setPriority] = useState('3');
  const [formError, setFormError] = useState('');
  const [latestPlan, setLatestPlan] = useState<GoalPlanResponse | null>(null);
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['goals'],
    queryFn: async () => {
      const response = await fetch('/api/financial?include_goals=true');
      if (!response.ok) throw new Error('Failed to fetch goals');
      return response.json();
    },
    enabled: isClient,
  });

  const planMutation = useMutation({
    mutationFn: async (payload: Record<string, any>) => {
      const response = await fetch('/api/goals/plan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate goal plan');
      }

      return result as GoalPlanResponse;
    },
    onSuccess: async (result) => {
      setLatestPlan(result);
      setIsPlanModalOpen(true);
      setFormError('');
      await queryClient.invalidateQueries({ queryKey: ['goals'] });
      await queryClient.invalidateQueries({ queryKey: ['insights-all'] });
      await queryClient.invalidateQueries({ queryKey: ['insights-new'] });
    },
    onError: (error: any) => {
      setFormError(error.message || 'Failed to generate goal plan');
    },
  });

  const goals: GoalRow[] = useMemo(() => data?.goals || [], [data?.goals]);
  const currency = String(data?.currency || 'USD').toUpperCase();

  const handleCreateAndPlanGoal = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError('');

    const parsedTargetAmount = Number(targetAmount);
    const parsedCurrentAmount = Number(currentAmount || 0);
    const parsedMonthlyContribution = monthlyContribution ? Number(monthlyContribution) : null;
    const parsedPriority = Number(priority || 3);

    if (!name.trim()) {
      setFormError('Goal name is required.');
      return;
    }

    if (!Number.isFinite(parsedTargetAmount) || parsedTargetAmount <= 0) {
      setFormError('Target amount must be greater than 0.');
      return;
    }

    if (!Number.isFinite(parsedCurrentAmount) || parsedCurrentAmount < 0) {
      setFormError('Current amount cannot be negative.');
      return;
    }

    if (parsedCurrentAmount > parsedTargetAmount) {
      setFormError('Current amount cannot be greater than target amount.');
      return;
    }

    if (parsedMonthlyContribution !== null && (!Number.isFinite(parsedMonthlyContribution) || parsedMonthlyContribution < 0)) {
      setFormError('Monthly contribution must be a positive number.');
      return;
    }

    await planMutation.mutateAsync({
      createGoal: true,
      saveAsInsight: true,
      goal: {
        name: name.trim(),
        description: description.trim() || null,
        category,
        targetAmount: parsedTargetAmount,
        currentAmount: parsedCurrentAmount,
        targetDate: targetDate || null,
        monthlyContribution: parsedMonthlyContribution,
        priority: Number.isFinite(parsedPriority) ? parsedPriority : 3,
      },
    });

    setName('');
    setDescription('');
    setCategory('savings');
    setTargetAmount('');
    setCurrentAmount('');
    setTargetDate('');
    setMonthlyContribution('');
    setPriority('3');
  };

  const handleGeneratePlanForExistingGoal = async (goalId: string) => {
    setFormError('');
    await planMutation.mutateAsync({
      goalId,
      createGoal: false,
      saveAsInsight: true,
    });
  };

  if (isLoading) {
    return <div>Loading goals...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Goals</h1>
        <p className="mt-1 text-gray-500">
          Create custom goals and get an AI strategy for exactly how to reach them.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Goal + Generate AI Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleCreateAndPlanGoal}>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="goal-name">Goal Name</Label>
                <Input
                  id="goal-name"
                  placeholder="Build emergency fund"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-category">Category</Label>
                <select
                  id="goal-category"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                >
                  <option value="savings">Savings</option>
                  <option value="debt">Debt</option>
                  <option value="investing">Investing</option>
                  <option value="emergency_fund">Emergency Fund</option>
                  <option value="income">Income</option>
                  <option value="retirement">Retirement</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-target-amount">Target Amount ({currency})</Label>
                <Input
                  id="goal-target-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={targetAmount}
                  onChange={(event) => setTargetAmount(event.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-current-amount">Current Amount ({currency})</Label>
                <Input
                  id="goal-current-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={currentAmount}
                  onChange={(event) => setCurrentAmount(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-target-date">Target Date (Optional)</Label>
                <Input
                  id="goal-target-date"
                  type="date"
                  value={targetDate}
                  onChange={(event) => setTargetDate(event.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="goal-monthly-contribution">Planned Monthly Contribution ({currency})</Label>
                <Input
                  id="goal-monthly-contribution"
                  type="number"
                  min="0"
                  step="0.01"
                  value={monthlyContribution}
                  onChange={(event) => setMonthlyContribution(event.target.value)}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="goal-priority">Priority</Label>
                <select
                  id="goal-priority"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  <option value="1">1 - Highest</option>
                  <option value="2">2 - High</option>
                  <option value="3">3 - Medium</option>
                  <option value="4">4 - Low</option>
                  <option value="5">5 - Lowest</option>
                </select>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="goal-description">Goal Notes (Optional)</Label>
                <textarea
                  id="goal-description"
                  className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Add context like timeline, constraints, or why this goal matters."
                />
              </div>
            </div>

            {formError ? <p className="text-sm text-red-600">{formError}</p> : null}

            <Button type="submit" disabled={planMutation.isPending}>
              {planMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create Goal and Generate Plan
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={isPlanModalOpen} onOpenChange={setIsPlanModalOpen}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {latestPlan ? `AI Plan for "${latestPlan.goal.name}"` : 'AI Goal Plan'}
            </DialogTitle>
            <DialogDescription>
              Personalized execution steps based on your goals, financial profile, and uploaded statements.
            </DialogDescription>
          </DialogHeader>

          {latestPlan ? (
            <div className="space-y-4">
              {latestPlan.plan?.summary ? (
                <p className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  {latestPlan.plan.summary}
                </p>
              ) : null}

              {Array.isArray(latestPlan.plan?.actionPlan) && latestPlan.plan.actionPlan.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">Action Plan</p>
                  <div className="space-y-2">
                    {latestPlan.plan.actionPlan.map((item, index) => (
                      <div key={`${item.step}-${index}`} className="rounded-md border border-gray-200 p-3 text-sm">
                        <p className="font-medium text-gray-900">{item.step}</p>
                        {item.timeline ? <p className="text-gray-600">Timeline: {item.timeline}</p> : null}
                        {item.estimatedImpact ? (
                          <p className="text-gray-600">Estimated Impact: {formatCurrency(item.estimatedImpact, currency)}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {Array.isArray(latestPlan.plan?.monthlyMilestones) && latestPlan.plan.monthlyMilestones.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">Monthly Milestones</p>
                  <div className="space-y-2">
                    {latestPlan.plan.monthlyMilestones.map((milestone, index) => (
                      <div key={`${milestone.month}-${index}`} className="rounded-md border border-gray-200 p-3 text-sm">
                        <p className="font-medium text-gray-900">
                          {milestone.month}: {formatCurrency(milestone.targetAmount, currency)}
                        </p>
                        {milestone.why ? <p className="text-gray-600">{milestone.why}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {Array.isArray(latestPlan.plan?.budgetAdjustments) && latestPlan.plan.budgetAdjustments.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">Budget Adjustments</p>
                  <div className="space-y-2">
                    {latestPlan.plan.budgetAdjustments.map((adjustment, index) => (
                      <div key={`${adjustment.category}-${index}`} className="rounded-md border border-gray-200 p-3 text-sm">
                        <p className="font-medium text-gray-900">
                          {prettifyLabel(adjustment.category)}: {formatCurrency(Number(adjustment.delta || 0), currency)}
                        </p>
                        {adjustment.reason ? <p className="text-gray-600">{adjustment.reason}</p> : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {Array.isArray(latestPlan.plan?.riskMitigations) && latestPlan.plan.riskMitigations.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">Risk Mitigations</p>
                  <div className="space-y-1 text-sm text-gray-700">
                    {latestPlan.plan.riskMitigations.map((risk, index) => (
                      <p key={`${risk}-${index}`}>{index + 1}. {risk}</p>
                    ))}
                  </div>
                </div>
              ) : null}

              {Array.isArray(latestPlan.plan?.trackingMetrics) && latestPlan.plan.trackingMetrics.length > 0 ? (
                <div>
                  <p className="mb-2 text-sm font-semibold text-gray-900">Tracking Metrics</p>
                  <div className="space-y-1 text-sm text-gray-700">
                    {latestPlan.plan.trackingMetrics.map((metric, index) => (
                      <p key={`${metric}-${index}`}>{index + 1}. {metric}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-gray-600">No plan generated yet.</p>
          )}
        </DialogContent>
      </Dialog>

      {goals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-gray-600">No goals set yet.</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {goals.map((goal) => (
            <Card key={goal.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-lg">{goal.name}</CardTitle>
                    <p className="mt-1 text-sm text-gray-500">{prettifyLabel(goal.category)}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={planMutation.isPending}
                    onClick={() => handleGeneratePlanForExistingGoal(goal.id)}
                  >
                    {planMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Target className="mr-2 h-4 w-4" />}
                    Generate AI Plan
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 gap-2 text-sm text-gray-600 md:grid-cols-2">
                  <p>Target: {formatCurrency(goal.target_amount, currency)}</p>
                  <p>Current: {formatCurrency(goal.current_amount, currency)}</p>
                  <p>
                    Contribution:{' '}
                    {goal.monthly_contribution ? formatCurrency(goal.monthly_contribution, currency) : 'Not set'}
                  </p>
                  <p>Priority: {goal.priority || 3}</p>
                </div>
                <div className="mt-3 h-2 rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{ width: `${Math.min(Number(goal.progress_percentage || 0), 100)}%` }}
                  />
                </div>
                {goal.description ? <p className="mt-3 text-sm text-gray-600">{goal.description}</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
