'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, FileText, X, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadedFile {
  file: File;
  id: string;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error';
  progress: number;
  error?: string;
  documentId?: string;
  novaDocumentId?: string;
  transactionCount?: number;
}

interface DocumentUploadZoneProps {
  onUploadComplete?: (documentId: string) => void;
}

export function DocumentUploadZone({ onUploadComplete }: DocumentUploadZoneProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [documentType, setDocumentType] = useState('bank_statement');
  const [accountName, setAccountName] = useState('');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles = acceptedFiles.map((file) => ({
      file,
      id: crypto.randomUUID(),
      status: 'pending' as const,
      progress: 0,
    }));

    setFiles((prev) => [...prev, ...newFiles]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/pdf': ['.pdf'],
    },
    maxSize: 25 * 1024 * 1024,
    multiple: true,
  });

  const uploadFile = async (fileId: string) => {
    const selected = files.find((item) => item.id === fileId);
    if (!selected) return;

    setFiles((prev) =>
      prev.map((item) =>
        item.id === fileId ? { ...item, status: 'uploading', progress: 15 } : item,
      ),
    );

    try {
      const formData = new FormData();
      formData.append('file', selected.file);
      formData.append('documentType', documentType);
      if (accountName) formData.append('accountName', accountName);

      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || 'Upload failed');
      }

      setFiles((prev) =>
        prev.map((item) =>
          item.id === fileId
            ? {
                ...item,
                status: 'processing',
                progress: 55,
                documentId: payload.documentId,
                novaDocumentId: payload.novaDocumentId,
              }
            : item,
        ),
      );

      pollProcessingStatus(fileId, payload.documentId);
    } catch (error: any) {
      setFiles((prev) =>
        prev.map((item) =>
          item.id === fileId
            ? {
                ...item,
                status: 'error',
                error: error.message || 'Upload failed',
              }
            : item,
        ),
      );
    }
  };

  const pollProcessingStatus = async (fileId: string, documentId: string) => {
    const checkStatus = async () => {
      try {
        const response = await fetch(`/api/documents/${documentId}`);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || 'Status check failed');
        }

        if (payload.processing_status === 'completed') {
          setFiles((prev) =>
            prev.map((item) =>
              item.id === fileId
                ? {
                    ...item,
                    status: 'completed',
                    progress: 100,
                    transactionCount: payload.transaction_count,
                  }
                : item,
            ),
          );

          if (onUploadComplete) {
            onUploadComplete(documentId);
          }

          return;
        }

        if (payload.processing_status === 'failed') {
          setFiles((prev) =>
            prev.map((item) =>
              item.id === fileId
                ? {
                    ...item,
                    status: 'error',
                    error: payload.processing_error || 'Processing failed',
                  }
                : item,
            ),
          );
          return;
        }

        setTimeout(checkStatus, 3000);
      } catch (error: any) {
        setFiles((prev) =>
          prev.map((item) =>
            item.id === fileId
              ? {
                  ...item,
                  status: 'error',
                  error: error.message || 'Status check failed',
                }
              : item,
          ),
        );
      }
    };

    checkStatus();
  };

  const uploadAll = () => {
    files
      .filter((item) => item.status === 'pending')
      .forEach((item) => {
        void uploadFile(item.id);
      });
  };

  const removeFile = (fileId: string) => {
    setFiles((prev) => prev.filter((item) => item.id !== fileId));
  };

  return (
    <div className="space-y-6">
      <div
        {...getRootProps()}
        className={cn(
          'cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-all duration-200',
          isDragActive ? 'scale-105 border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50',
        )}
      >
        <input {...getInputProps()} />

        <div className="flex flex-col items-center gap-4">
          <div className="rounded-full bg-blue-100 p-4">
            <Upload className="h-8 w-8 text-blue-600" />
          </div>

          <div>
            <p className="mb-1 text-lg font-semibold">
              {isDragActive ? 'Drop files here' : 'Upload Bank Statements'}
            </p>
            <p className="text-sm text-gray-500">Drag and drop or click to browse</p>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            <div className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              CSV, Excel, PDF
            </div>
            <div>•</div>
            <div>Max 25MB per file</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="documentType">Document Type</Label>
          <Select value={documentType} onValueChange={setDocumentType}>
            <SelectTrigger id="documentType">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bank_statement">Bank Statement</SelectItem>
              <SelectItem value="credit_card_statement">Credit Card Statement</SelectItem>
              <SelectItem value="investment_statement">Investment Statement</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="accountName">Account Name (Optional)</Label>
          <Input
            id="accountName"
            type="text"
            value={accountName}
            onChange={(event) => setAccountName(event.target.value)}
            placeholder="e.g. Chase Checking"
          />
        </div>
      </div>

      {files.length > 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Selected Files ({files.length})</h3>
            {files.some((item) => item.status === 'pending') ? (
              <Button type="button" size="sm" onClick={uploadAll}>
                Upload All
              </Button>
            ) : null}
          </div>

          {files.map((uploadedFile) => (
            <Card key={uploadedFile.id} className="p-4">
              <div className="flex items-start gap-3">
                <FileText className="mt-1 h-5 w-5 flex-shrink-0 text-blue-600" />

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="truncate font-medium">{uploadedFile.file.name}</p>

                    {uploadedFile.status === 'pending' ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        type="button"
                        onClick={() => removeFile(uploadedFile.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>

                  <p className="mb-2 text-sm text-gray-500">{(uploadedFile.file.size / 1024).toFixed(2)} KB</p>

                  {uploadedFile.status === 'uploading' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-blue-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Uploading to encrypted storage
                      </div>
                      <Progress value={uploadedFile.progress} />
                    </div>
                  ) : null}

                  {uploadedFile.status === 'processing' ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-blue-600">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Processing inside NEAR AI TEE
                      </div>
                      <Progress value={uploadedFile.progress} />
                      <p className="text-xs text-gray-500">Your data is being processed in secure enclave execution.</p>
                    </div>
                  ) : null}

                  {uploadedFile.status === 'completed' ? (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <CheckCircle className="h-4 w-4" />
                      <span>
                        Processed successfully • {uploadedFile.transactionCount || 0} transactions
                      </span>
                    </div>
                  ) : null}

                  {uploadedFile.status === 'error' ? (
                    <div className="flex items-center gap-2 text-sm text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      <span>{uploadedFile.error || 'Upload failed'}</span>
                    </div>
                  ) : null}

                  {uploadedFile.status === 'pending' ? (
                    <Button size="sm" type="button" onClick={() => uploadFile(uploadedFile.id)}>
                      Upload
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      <Card className="border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          End-to-end privacy: files are encrypted before storage, processed in TEE, and only summarized financial insights are retained.
        </p>
      </Card>
    </div>
  );
}
