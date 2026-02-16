'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight } from 'lucide-react';

interface Insight {
  id: string;
  category: string;
  title: string;
  description: string;
  potential_savings?: number;
  potential_earnings?: number;
  impact_level: 'critical' | 'high' | 'medium' | 'low';
  complexity?: string;
  estimated_time?: string;
  status: string;
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

const impactColor: Record<string, string> = {
  critical: 'bg-red-100 text-red-700',
  high: 'bg-amber-100 text-amber-700',
  medium: 'bg-blue-100 text-blue-700',
  low: 'bg-gray-100 text-gray-700',
};

export function InsightCard({ insight, currency = 'USD' }: { insight: Insight; currency?: string }) {
  const [loading, setLoading] = useState(false);

  const updateStatus = async (status: string) => {
    setLoading(true);

    try {
      await fetch(`/api/insights/${insight.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status }),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">{insight.title}</CardTitle>
            <p className="mt-1 text-sm text-gray-500">{insight.category.replace('_', ' ')}</p>
          </div>
          <Badge className={impactColor[insight.impact_level] || impactColor.medium}>{insight.impact_level}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-700">{insight.description}</p>

        <div className="flex flex-wrap gap-4 text-sm">
          {insight.potential_savings ? (
            <div>
              <span className="text-gray-500">Potential Savings:</span>{' '}
              <span className="font-semibold text-green-600">{formatCurrency(insight.potential_savings, currency)}</span>
            </div>
          ) : null}
          {insight.potential_earnings ? (
            <div>
              <span className="text-gray-500">Potential Earnings:</span>{' '}
              <span className="font-semibold text-blue-600">{formatCurrency(insight.potential_earnings, currency)}</span>
            </div>
          ) : null}
          {insight.estimated_time ? (
            <div>
              <span className="text-gray-500">Time:</span> <span className="font-medium">{insight.estimated_time}</span>
            </div>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={() => updateStatus('in_progress')} disabled={loading}>
            Start Action <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => updateStatus('dismissed')} disabled={loading}>
            Dismiss
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
