import type { ParsedTransaction } from '@/lib/utils/csv-parser';

interface MonthlySummary {
  total_income: number;
  income_count: number;
  income_by_source: Record<string, number>;
  total_expenses: number;
  expense_count: number;
  expenses_by_category: Record<string, number>;
  top_merchants: Array<{ name: string; amount: number; count: number }>;
}

export function groupTransactionsByMonth(transactions: ParsedTransaction[]) {
  const rawSummaries: Record<
    string,
    Omit<MonthlySummary, 'top_merchants'> & {
      top_merchants: Record<string, { amount: number; count: number }>;
    }
  > = {};

  transactions.forEach((tx) => {
    const month = `${tx.date.substring(0, 7)}-01`;

    if (!rawSummaries[month]) {
      rawSummaries[month] = {
        total_income: 0,
        income_count: 0,
        income_by_source: {},
        total_expenses: 0,
        expense_count: 0,
        expenses_by_category: {},
        top_merchants: {},
      };
    }

    const summary = rawSummaries[month];

    if (tx.amount > 0) {
      summary.total_income += tx.amount;
      summary.income_count += 1;
      const source = tx.category.replace('income_', '') || 'other';
      summary.income_by_source[source] = (summary.income_by_source[source] || 0) + tx.amount;
      return;
    }

    const expenseAmount = Math.abs(tx.amount);
    summary.total_expenses += expenseAmount;
    summary.expense_count += 1;
    summary.expenses_by_category[tx.category] = (summary.expenses_by_category[tx.category] || 0) + expenseAmount;

    const merchant = tx.description.substring(0, 50);

    if (!summary.top_merchants[merchant]) {
      summary.top_merchants[merchant] = { amount: 0, count: 0 };
    }

    summary.top_merchants[merchant].amount += expenseAmount;
    summary.top_merchants[merchant].count += 1;
  });

  const finalized: Record<string, MonthlySummary> = {};

  for (const [month, summary] of Object.entries(rawSummaries)) {
    const topMerchants = Object.entries(summary.top_merchants)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5);

    finalized[month] = {
      ...summary,
      top_merchants: topMerchants,
    };
  }

  return finalized;
}
