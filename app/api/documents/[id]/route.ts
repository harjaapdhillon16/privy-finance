import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerSupabaseClient } from '@/lib/supabase/server';
import { NovaStorageService } from '@/lib/nova/client';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
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

    const { data, error } = await supabase
      .from('nova_documents')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Get document error', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch document' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
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
    const sourceDeleteResult = await novaService.deleteDocument(
      document.nova_document_id,
      document.nova_encryption_key_id,
    );

    const { error: deleteError } = await supabase.from('nova_documents').delete().eq('id', params.id);
    if (deleteError) throw deleteError;

    return NextResponse.json({
      success: true,
      novaDeleted: sourceDeleteResult.deletedAtSource,
      message: sourceDeleteResult.deletedAtSource
        ? 'Document deleted from NOVA and removed from your app records.'
        : sourceDeleteResult.reason || 'Document removed from app records. Source delete not supported by current NOVA SDK.',
    });
  } catch (error: any) {
    console.error('Delete document error', error);
    return NextResponse.json({ error: error.message || 'Delete failed' }, { status: 500 });
  }
}
