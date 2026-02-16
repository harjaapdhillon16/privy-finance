import { NextRequest, NextResponse } from 'next/server';
import { NovaStorageService } from '@/lib/nova/client';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function sanitizeFilename(filename: string) {
  return filename.replace(/["\\\r\n]/g, '_');
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const supabase = createRouteHandlerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: document, error: documentError } = await supabase
      .from('nova_documents')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (documentError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const novaService = new NovaStorageService(user.id);
    const fileBlob = await novaService.downloadDocument(
      document.nova_document_id,
      document.nova_encryption_key_id,
    );

    const buffer = await fileBlob.arrayBuffer();
    const mimeType = document.mime_type || 'application/octet-stream';
    const isPdf =
      mimeType.includes('pdf') || String(document.file_type || '').toLowerCase() === 'pdf';
    const inlineRequested = request.nextUrl.searchParams.get('inline');
    const shouldInline = inlineRequested === 'true' || (inlineRequested === null && isPdf);
    const disposition = shouldInline ? 'inline' : 'attachment';
    const safeFilename = sanitizeFilename(document.file_name || 'document');

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(buffer.byteLength),
        'Content-Disposition': `${disposition}; filename="${safeFilename}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('View document error', error);
    return NextResponse.json({ error: error.message || 'Failed to open document' }, { status: 500 });
  }
}

