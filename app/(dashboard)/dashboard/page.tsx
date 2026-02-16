'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { buttonVariants } from '@/components/ui/button';
import { DollarSign, TrendingUp, Lightbulb, Target, FileText } from 'lucide-react';
import { NetWorthChart } from '@/components/dashboard/NetWorthChart';
import { InsightCard } from '@/components/dashboard/InsightCard';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

export default function DashboardPage() {
  const isClient = typeof window !== 'undefined';

  const { data: analysisData, isLoading: analysisLoading } = useQuery({
    queryKey: ['latest-analysis'],
    queryFn: async () => {
      const response = await fetch('/api/analysis/latest');
      if (!response.ok) throw new Error('Failed to fetch analysis');
      return response.json();
    },
    enabled: isClient,
  });

  const { data: insightsData } = useQuery({
    queryKey: ['insights-new'],
    queryFn: async () => {
      const response = await fetch('/api/insights?status=new&limit=3');
      if (!response.ok) throw new Error('Failed to fetch insights');
      return response.json();
    },
    enabled: isClient,
  });

  const { data: financialData } = useQuery({
    queryKey: ['financial-data'],
    queryFn: async () => {
      const response = await fetch('/api/financial');
      if (!response.ok) throw new Error('Failed to fetch financial data');
      return response.json();
    },
    enabled: isClient,
  });

  if (analysisLoading) {
    return <div>Loading...</div>;
  }

  const analysis = analysisData?.analysis;
  const insights = insightsData?.insights || [];
  const currency = String(financialData?.currency || 'USD').toUpperCase();

  const monthlyIncome = Number(analysis?.cashFlow?.monthlyIncome || 0);
  const monthlyExpenses = Number(analysis?.cashFlow?.monthlyExpenses || 0);
  const monthlySavings = monthlyIncome - monthlyExpenses;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Financial Overview</h1>
        <p className="mt-1 text-gray-500">Your complete financial picture, analyzed privately</p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Net Worth</CardTitle>
            <DollarSign className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(Number(financialData?.financial?.net_worth || 0), currency)}</div>
            <p className="mt-1 flex items-center text-xs text-green-600">
              <TrendingUp className="mr-1 h-3 w-3" />
              +12.3% trend
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Monthly Savings</CardTitle>
            <Target className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(monthlySavings, currency)}</div>
            <p className="mt-1 text-xs text-gray-600">{Number(analysis?.cashFlow?.savingsRate || 0)}% savings rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Optimization Opportunities</CardTitle>
            <Lightbulb className="h-4 w-4 text-gray-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{insights.length}</div>
            <p className="mt-1 text-xs text-blue-600">View recommendations</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="analysis" className="space-y-6">
        <TabsList>
          <TabsTrigger value="analysis">Analysis</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="goals">Goals</TabsTrigger>
        </TabsList>

        <TabsContent value="analysis" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Net Worth Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <NetWorthChart />
            </CardContent>
          </Card>

          {analysis?.cashFlow ? (
            <Card>
              <CardHeader>
                <CardTitle>Cash Flow Analysis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-sm text-gray-500">Monthly Income</p>
                    <p className="text-2xl font-bold text-green-600">{formatCurrency(monthlyIncome, currency)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Monthly Expenses</p>
                    <p className="text-2xl font-bold text-red-600">{formatCurrency(monthlyExpenses, currency)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Net Savings</p>
                    <p className="text-2xl font-bold text-blue-600">{formatCurrency(monthlySavings, currency)}</p>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <p className="mb-2 text-sm font-medium">Top Spending Categories</p>
                  <div className="space-y-2">
                    {(analysis.cashFlow.topCategories || []).map((cat: any, index: number) => (
                      <div key={`${cat.category}-${index}`} className="flex items-center justify-between">
                        <span className="text-sm">{cat.category}</span>
                        <div className="flex items-center gap-3">
                          <div className="h-2 w-32 rounded-full bg-gray-200">
                            <div
                              className="h-2 rounded-full bg-blue-600"
                              style={{ width: `${Number(cat.percentage || 0)}%` }}
                            />
                          </div>
                          <span className="w-16 text-right text-sm font-medium">
                            {formatCurrency(Number(cat.amount || 0), currency)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="insights" className="space-y-4">
          {insights.length > 0 ? (
            insights.map((insight: any) => <InsightCard key={insight.id} insight={insight} currency={currency} />)
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Lightbulb className="mx-auto mb-4 h-12 w-12 text-gray-400" />
                <p className="text-gray-600">No insights yet. Upload statements to get started.</p>
                <Link href="/dashboard/transactions" className={`${buttonVariants()} mt-4`}>
                  <FileText className="mr-2 h-4 w-4" />
                  Upload Transactions
                </Link>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="goals">
          <Card>
            <CardContent className="py-12 text-center">
              <Target className="mx-auto mb-4 h-12 w-12 text-gray-400" />
              <p className="mb-4 text-gray-600">Set financial goals and track progress.</p>
              <Link href="/dashboard/goals" className={buttonVariants()}>
                View Goals
              </Link>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
