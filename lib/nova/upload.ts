import { NovaStorageService } from '@/lib/nova/client';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

function inferMimeType(fileName: string, fallback?: string) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  return fallback || 'application/octet-stream';
}

export async function uploadDocumentToNova(
  userId: string,
  file: File,
  metadata: {
    documentType: string;
    accountName?: string;
    statementPeriodStart?: string;
    statementPeriodEnd?: string;
  },
) {
  const supabase = createRouteHandlerSupabaseClient();
  const novaService = new NovaStorageService(userId);

  const { documentId, encryptionKeyId } = await novaService.uploadDocument(file, {
    documentType: metadata.documentType,
    accountName: metadata.accountName,
  });

  const { data: document, error } = await supabase
    .from('nova_documents')
    .insert({
      user_id: userId,
      nova_document_id: documentId,
      nova_encryption_key_id: encryptionKeyId,
      file_name: file.name,
      file_size: file.size,
      file_type: file.name.split('.').pop()?.toLowerCase() || '',
      mime_type: inferMimeType(file.name, file.type),
      document_type: metadata.documentType,
      account_name: metadata.accountName,
      statement_period_start: metadata.statementPeriodStart,
      statement_period_end: metadata.statementPeriodEnd,
      processing_status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;

  return {
    success: true,
    documentId: document.id,
    novaDocumentId: documentId,
  };
}
