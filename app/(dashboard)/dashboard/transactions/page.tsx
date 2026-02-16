'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DocumentUploadZone } from '@/components/upload/DocumentUploadZone';

export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
        <p className="mt-1 text-gray-500">Upload your statements for private analysis.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Financial Documents</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentUploadZone />
        </CardContent>
      </Card>
    </div>
  );
}
