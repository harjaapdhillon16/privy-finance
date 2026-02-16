'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, Lightbulb, Target, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { format } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { InsightCard } from '@/components/dashboard/InsightCard';

interface OptimizationPayload {
  currency: string;
  metrics: {
    averageIncome: number;
    averageExpenses: number;
    averageNet: number;
    savingsRate: number;
    expenseVolatility: number;
    projectedAnnualNet: number;
    potentialSavings: number;
    potentialEarnings: number;
    opportunityPool: number;
    monthsOfRunway: number;
    optimizationScore: number;
    netWorth: number;
  };
  monthlySeries: Array<{
    month: string;
    income: number;
    expenses: number;
    net: number;
    savingsRate: number;
  }>;
  spendingByCategory: Array<{ category: string; amount: number; percentage: number }>;
  topMerchants: Array<{ name: string; amount: number; count: number }>;
  impactDistribution: Array<{ impact: string; count: number }>;
  insightCategoryDistribution: Array<{ category: string; count: number }>;
  recentTransactions: Array<{
    date: string;
    summaryMonth: string;
    description: string;
    amount: number;
    category: string;
  }>;
  bestMonth: { month: string | null; net: number };
  worstMonth: { month: string | null; net: number };
  analysisHighlights: {
    overall: any;
    spending: any;
    cashFlow: any;
    recommendations: string[];
  };
  insights: any[];
}

const impactColor: Record<string, string> = {
  critical: '#dc2626',
  high: '#d97706',
  medium: '#2563eb',
  low: '#64748b',
};

const pieColors = ['#2563eb', '#0f766e', '#d97706', '#9333ea', '#f97316', '#64748b'];

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatPercent(value: number) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function formatCompactCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function prettifyLabel(value: string) {
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export default function OptimizationPage() {
  const isClient = typeof window !== 'undefined';

  const { data, isLoading, error } = useQuery({
    queryKey: ['optimization-deep-insights'],
    queryFn: async () => {
      const response = await fetch('/api/optimization');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to fetch optimization analytics');
      return payload as OptimizationPayload;
    },
    enabled: isClient,
  });

  const insights = data?.insights || [];
  const currency = data?.currency || 'USD';
  const metrics = data?.metrics;
  const monthlySeries = useMemo(() => data?.monthlySeries || [], [data?.monthlySeries]);
  const spendingByCategory = data?.spendingByCategory || [];
  const topMerchants = data?.topMerchants || [];
  const impactDistribution = data?.impactDistribution || [];
  const recentTransactions = data?.recentTransactions || [];
  const analysisRecommendations = Array.isArray(data?.analysisHighlights?.recommendations)
    ? data.analysisHighlights.recommendations
    : [];
  const analysisConcerns = Array.isArray(data?.analysisHighlights?.spending?.concerns)
    ? data.analysisHighlights.spending.concerns
    : [];
  const analysisPositives = Array.isArray(data?.analysisHighlights?.spending?.positives)
    ? data.analysisHighlights.spending.positives
    : [];
  const hasAnalytics = monthlySeries.length > 0;

  const chartSeries = useMemo(
    () =>
      monthlySeries.map((entry) => ({
        ...entry,
        monthLabel: format(new Date(entry.month), 'MMM yy'),
      })),
    [monthlySeries],
  );

  if (isLoading) {
    return <div>Loading optimization analytics...</div>;
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-red-600">
          {error instanceof Error ? error.message : 'Failed to load optimization analytics'}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Optimization</h1>
        <p className="mt-1 text-gray-500">
          Deep AI insights across your documents with cashflow analytics, spending diagnostics, and action plans.
        </p>
      </div>

      {metrics ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Avg Monthly Net</p>
                <Wallet className="h-4 w-4 text-gray-400" />
              </div>
              <p className={`mt-2 text-2xl font-bold ${metrics.averageNet >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(metrics.averageNet, currency)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Savings Rate</p>
                <Target className="h-4 w-4 text-gray-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-blue-700">{formatPercent(metrics.savingsRate)}</p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Opportunity Pool</p>
                <Lightbulb className="h-4 w-4 text-gray-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-indigo-700">
                {formatCurrency(metrics.opportunityPool, currency)}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Savings {formatCurrency(metrics.potentialSavings, currency)} + Earnings{' '}
                {formatCurrency(metrics.potentialEarnings, currency)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">Expense Volatility</p>
                <Activity className="h-4 w-4 text-gray-400" />
              </div>
              <p className="mt-2 text-2xl font-bold text-amber-600">{formatPercent(metrics.expenseVolatility)}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {metrics ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Income vs Expenses Trend</CardTitle>
            </CardHeader>
            <CardContent className="h-80">
              {hasAnalytics ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartSeries}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                    <XAxis dataKey="monthLabel" />
                    <YAxis tickFormatter={(value) => formatCompactCurrency(Number(value), currency)} />
                    <Tooltip
                      formatter={(value: number, key) => [formatCurrency(value, currency), prettifyLabel(String(key))]}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="income" stroke="#16a34a" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="expenses" stroke="#dc2626" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="net" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  Upload more statements to unlock trend analytics.
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Optimization Score</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-blue-700">{Number(metrics.optimizationScore).toFixed(1)}</div>
              <p className="mt-1 text-sm text-gray-500">Score out of 100</p>
              <div className="mt-4 h-3 rounded-full bg-gray-200">
                <div
                  className="h-3 rounded-full bg-blue-600"
                  style={{ width: `${Math.min(Math.max(metrics.optimizationScore, 0), 100)}%` }}
                />
              </div>
              <div className="mt-4 space-y-2 text-sm text-gray-600">
                <p>Projected annual net: {formatCurrency(metrics.projectedAnnualNet, currency)}</p>
                <p>Cash runway: {Number(metrics.monthsOfRunway).toFixed(1)} months</p>
                <p>Net worth snapshot: {formatCurrency(metrics.netWorth, currency)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Spending Categories</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {spendingByCategory.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={spendingByCategory}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                  <XAxis dataKey="category" tickFormatter={(value) => prettifyLabel(String(value))} interval={0} angle={-20} height={70} textAnchor="end" />
                  <YAxis tickFormatter={(value) => formatCompactCurrency(Number(value), currency)} />
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value, currency)}
                    labelFormatter={(label) => prettifyLabel(String(label))}
                  />
                  <Bar dataKey="amount" fill="#2563eb" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">No category data yet.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top Merchants</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {topMerchants.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topMerchants} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
                  <XAxis type="number" tickFormatter={(value) => formatCompactCurrency(Number(value), currency)} />
                  <YAxis dataKey="name" type="category" width={130} />
                  <Tooltip formatter={(value: number) => formatCurrency(value, currency)} />
                  <Bar dataKey="amount" fill="#0f766e" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">No merchant concentration data yet.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Insight Impact Distribution</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {impactDistribution.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={impactDistribution} dataKey="count" nameKey="impact" outerRadius={95} label>
                    {impactDistribution.map((entry, index) => (
                      <Cell key={`${entry.impact}-${index}`} fill={impactColor[entry.impact] || pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                No insight distribution data yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Financial Signals</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data?.bestMonth?.month ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-green-900">Best Net Month</span>
                  <TrendingUp className="h-4 w-4 text-green-700" />
                </div>
                <p className="mt-1 text-sm text-green-800">
                  {format(new Date(data.bestMonth.month), 'MMM yyyy')} •{' '}
                  {formatCurrency(Number(data.bestMonth.net || 0), currency)}
                </p>
              </div>
            ) : null}

            {data?.worstMonth?.month ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-red-900">Worst Net Month</span>
                  <TrendingDown className="h-4 w-4 text-red-700" />
                </div>
                <p className="mt-1 text-sm text-red-800">
                  {format(new Date(data.worstMonth.month), 'MMM yyyy')} •{' '}
                  {formatCurrency(Number(data.worstMonth.net || 0), currency)}
                </p>
              </div>
            ) : null}

            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-800">AI Recommendations</p>
              {analysisRecommendations.length > 0 ? (
                <div className="space-y-2">
                  {analysisRecommendations.slice(0, 4).map((item: string, index: number) => (
                    <p key={`${item}-${index}`} className="text-sm text-gray-600">
                      {index + 1}. {item}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No recommendation summary available yet.</p>
              )}
            </div>

            {analysisConcerns.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {analysisConcerns.slice(0, 4).map((concern: string, index: number) => (
                  <Badge key={`${concern}-${index}`} variant="outline" className="border-red-200 bg-red-50 text-red-700">
                    {concern}
                  </Badge>
                ))}
              </div>
            ) : null}

            {analysisPositives.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {analysisPositives.slice(0, 3).map((positive: string, index: number) => (
                  <Badge key={`${positive}-${index}`} variant="outline" className="border-green-200 bg-green-50 text-green-700">
                    {positive}
                  </Badge>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Transactions (Categorized)</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTransactions.length > 0 ? (
            <div className="max-h-[420px] overflow-auto rounded-md border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Description</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTransactions.slice(0, 250).map((tx, index) => (
                    <tr key={`${tx.date}-${tx.description}-${tx.amount}-${index}`} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-700">
                        {(() => {
                          const parsedDate = new Date(tx.date);
                          if (Number.isNaN(parsedDate.getTime())) {
                            return tx.summaryMonth;
                          }
                          return format(parsedDate, 'MMM d, yyyy');
                        })()}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="border-gray-200 bg-gray-50 text-gray-700">
                          {prettifyLabel(tx.category)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-gray-700">{tx.description}</td>
                      <td className={`px-3 py-2 text-right font-medium ${tx.amount >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency(tx.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-8 text-center text-sm text-gray-500">
              Transactions will appear here once statement parsing writes `all_transactions`.
            </div>
          )}
        </CardContent>
      </Card>

      {insights.length > 0 ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Actionable Insights</h2>
            <p className="text-sm text-gray-500">Prioritized recommendations generated from your documents.</p>
          </div>
          {insights.map((insight: any) => (
            <InsightCard key={insight.id} insight={insight} currency={currency} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Lightbulb className="mx-auto mb-4 h-12 w-12 text-gray-400" />
            <p className="text-gray-600">No insights yet. Upload documents to generate recommendations.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
