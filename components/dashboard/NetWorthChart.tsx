'use client';

import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';

interface DataPoint {
  date: string;
  netWorth: number;
}

export function NetWorthChart() {
  const isClient = typeof window !== 'undefined';

  const { data } = useQuery({
    queryKey: ['financial-history'],
    queryFn: async () => {
      const response = await fetch('/api/financial?history=true');
      if (!response.ok) throw new Error('Failed to fetch financial history');
      return response.json();
    },
    enabled: isClient,
  });

  const chartData: DataPoint[] = useMemo(() => {
    if (Array.isArray(data?.history) && data.history.length > 0) {
      return data.history;
    }

    return [
      { date: '2025-09-01', netWorth: 62000 },
      { date: '2025-10-01', netWorth: 64500 },
      { date: '2025-11-01', netWorth: 66800 },
      { date: '2025-12-01', netWorth: 69000 },
      { date: '2026-01-01', netWorth: 73000 },
    ];
  }, [data]);

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200" />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => format(new Date(value), 'MMM yy')}
            className="text-xs"
          />
          <YAxis
            tickFormatter={(value) => `$${(Number(value) / 1000).toFixed(0)}k`}
            className="text-xs"
          />
          <Tooltip
            formatter={(value: number) => [`$${value.toLocaleString()}`, 'Net Worth']}
            labelFormatter={(label) => format(new Date(label), 'MMM d, yyyy')}
          />
          <Line type="monotone" dataKey="netWorth" stroke="#2563eb" strokeWidth={3} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
