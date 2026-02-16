'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface DocumentRecord {
  id: string;
  nova_document_id: string;
  file_name: string;
  file_size: number;
  file_type: string;
  mime_type?: string | null;
  document_type: string;
  account_name?: string | null;
  statement_period_start?: string | null;
  statement_period_end?: string | null;
  date_range_start?: string | null;
  date_range_end?: string | null;
  processing_status: 'pending' | 'processing' | 'completed' | 'failed';
  processing_error?: string | null;
  processed_at?: string | null;
  transaction_count?: number | null;
  total_income?: number | null;
  total_expenses?: number | null;
  created_at: string;
}

interface DeleteDocumentResponse {
  success: boolean;
  novaDeleted?: boolean;
  message?: string;
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** unitIndex;
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`;
}

function formatDate(value?: string | null) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
}

function statusBadgeClass(status: DocumentRecord['processing_status']) {
  if (status === 'completed') return 'border-green-200 bg-green-50 text-green-700';
  if (status === 'processing') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function prettifyDocumentType(value: string) {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function shortenNovaId(id: string) {
  if (!id) return '';
  if (id.length <= 22) return id;
  return `${id.slice(0, 10)}...${id.slice(-10)}`;
}

export default function DocumentsPage() {
  const isClient = typeof window !== 'undefined';
  const queryClient = useQueryClient();
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['documents-list'],
    queryFn: async () => {
      const response = await fetch('/api/documents?limit=100');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Failed to fetch documents');
      return payload as { documents: DocumentRecord[]; count: number };
    },
    enabled: isClient,
  });

  const deleteMutation = useMutation({
    mutationFn: async (documentId: string) => {
      const response = await fetch(`/api/documents/${documentId}`, {
        method: 'DELETE',
      });

      const payload = (await response.json()) as DeleteDocumentResponse & { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || 'Failed to delete document');
      }

      return payload;
    },
    onSuccess: async (payload) => {
      setActionError('');
      setActionMessage(payload.message || 'Document deleted.');
      await queryClient.invalidateQueries({ queryKey: ['documents-list'] });
    },
    onError: (deleteError: any) => {
      setActionMessage('');
      setActionError(deleteError.message || 'Failed to delete document');
    },
  });

  const handleDelete = (documentId: string, fileName: string) => {
    const confirmed = window.confirm(
      `Delete "${fileName}" from your document list? This cannot be undone.`,
    );

    if (!confirmed) return;

    setActionError('');
    setActionMessage('');
    deleteMutation.mutate(documentId);
  };

  const openViewer = (documentId: string, inline: boolean) => {
    const url = `/api/documents/${documentId}/view?inline=${inline ? 'true' : 'false'}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const documents = data?.documents || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Documents</h1>
        <p className="mt-1 text-gray-500">All files you have uploaded and stored in NOVA.</p>
      </div>

      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="flex items-start gap-3 p-4">
          <Lock className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-700" />
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-blue-900">End-to-end encrypted on NOVA</p>
            <p className="text-blue-800">
              Your uploaded statements are encrypted before storage and remain encrypted at rest on NOVA.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Uploaded Documents ({documents.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {actionMessage ? <p className="text-sm text-blue-700">{actionMessage}</p> : null}
          {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

          {isLoading ? <p className="text-sm text-gray-500">Loading documents...</p> : null}

          {!isLoading && error ? (
            <p className="text-sm text-red-600">{error instanceof Error ? error.message : 'Failed to load documents'}</p>
          ) : null}

          {!isLoading && !error && documents.length === 0 ? (
            <div className="py-8 text-center">
              <FileText className="mx-auto mb-3 h-10 w-10 text-gray-400" />
              <p className="text-sm text-gray-600">No documents uploaded yet.</p>
            </div>
          ) : null}

          {!isLoading && !error
            ? documents.map((document) => (
                <div key={document.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{document.file_name}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {prettifyDocumentType(document.document_type)} • {document.file_type.toUpperCase()} •{' '}
                        {formatBytes(Number(document.file_size || 0))}
                      </p>
                    </div>
                    <Badge variant="outline" className={statusBadgeClass(document.processing_status)}>
                      {document.processing_status}
                    </Badge>
                  </div>

                  <div className="mt-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-2">
                    <p>Uploaded: {formatDate(document.created_at)}</p>
                    <p>Processed: {formatDate(document.processed_at)}</p>
                    <p>Account: {document.account_name || 'N/A'}</p>
                    <p>
                      Statement Period:{' '}
                      {(document.statement_period_start || document.date_range_start) &&
                      (document.statement_period_end || document.date_range_end)
                        ? `${document.statement_period_start || document.date_range_start} to ${
                            document.statement_period_end || document.date_range_end
                          }`
                        : 'N/A'}
                    </p>
                    <p>NOVA ID: {shortenNovaId(document.nova_document_id)}</p>
                    <p>
                      Transactions: {Number(document.transaction_count || 0).toLocaleString()} • Income: $
                      {Number(document.total_income || 0).toLocaleString()} • Expenses: $
                      {Number(document.total_expenses || 0).toLocaleString()}
                    </p>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {document.file_type?.toLowerCase() === 'pdf' || document.mime_type?.includes('pdf') ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openViewer(document.id, true)}
                      >
                        View PDF
                      </Button>
                    ) : null}

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openViewer(document.id, false)}
                    >
                      Download
                    </Button>

                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(document.id, document.file_name)}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending && deleteMutation.variables === document.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Delete
                    </Button>
                  </div>

                  {document.processing_error ? (
                    <p className="mt-2 text-xs text-red-600">Error: {document.processing_error}</p>
                  ) : null}
                </div>
              ))
            : null}
        </CardContent>
      </Card>
    </div>
  );
}
