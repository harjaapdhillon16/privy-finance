import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { uploadDocumentToNova } from '@/lib/nova/upload';

export const dynamic = 'force-dynamic';

async function triggerDocumentProcessing(documentId: string, origin: string) {
  const internalSecret = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  fetch(`${origin}/api/documents/${documentId}/process`, {
    method: 'POST',
    headers: {
      'x-internal-secret': internalSecret,
    },
    cache: 'no-store',
  }).catch((error) => {
    console.error('Failed to trigger document processing', error);
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const documentType = (formData.get('documentType') as string) || 'bank_statement';
    const accountName = (formData.get('accountName') as string) || undefined;
    const statementPeriodStart = (formData.get('statementPeriodStart') as string) || undefined;
    const statementPeriodEnd = (formData.get('statementPeriodEnd') as string) || undefined;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const result = await uploadDocumentToNova(user.id, file, {
      documentType,
      accountName: accountName?.trim() || undefined,
      statementPeriodStart,
      statementPeriodEnd,
    });

    const origin = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    await triggerDocumentProcessing(result.documentId, origin);

    return NextResponse.json({
      success: true,
      documentId: result.documentId,
      novaDocumentId: result.novaDocumentId,
    });
  } catch (error: any) {
    console.error('Upload error', error);
    return NextResponse.json({ error: error.message || 'Upload failed' }, { status: 500 });
  }
}
