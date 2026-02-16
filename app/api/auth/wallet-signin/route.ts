import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nacl from 'tweetnacl';
import { providers, utils } from 'near-api-js';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function getPublicSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('Supabase URL/anon key missing');
  }

  return createClient(supabaseUrl, anonKey);
}

function deriveWalletEmail(accountId: string) {
  const safeId = accountId.replace(/[^a-z0-9_.-]/gi, '_');
  return `${safeId}@near.wallet.local`;
}

function deriveWalletPassword(accountId: string) {
  const secret =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NOVA_API_KEY || process.env.NEAR_AI_API_KEY || 'privy';

  const hash = crypto.createHmac('sha256', secret).update(accountId).digest('hex');
  return `${hash}Aa!`;
}

function extractSignature(signature: any): Uint8Array {
  if (!signature) throw new Error('Missing signature payload');

  if (typeof signature === 'string') {
    return Buffer.from(signature, 'base64');
  }

  if (typeof signature.signature === 'string') {
    return Buffer.from(signature.signature, 'base64');
  }

  if (Array.isArray(signature.signature)) {
    return Uint8Array.from(signature.signature);
  }

  throw new Error('Invalid signature format');
}

async function verifyNearSignature(accountId: string, message: string, signature: any): Promise<boolean> {
  try {
    const rpcUrl = process.env.NEXT_PUBLIC_NEAR_HELPER_URL || 'https://rpc.mainnet.near.org';
    const provider = new providers.JsonRpcProvider({ url: rpcUrl });

    const accessKeys: any = await provider.query({
      request_type: 'view_access_key_list',
      finality: 'final',
      account_id: accountId,
    });

    const signatureBytes = extractSignature(signature);
    const messageBytes = new TextEncoder().encode(message);

    const keys = accessKeys?.keys || [];

    return keys.some((entry: any) => {
      const publicKey = entry.public_key as string;
      if (!publicKey?.startsWith('ed25519:')) return false;

      const decodedPublicKey = utils.serialize.base_decode(publicKey.replace('ed25519:', ''));
      return nacl.sign.detached.verify(messageBytes, signatureBytes, decodedPublicKey);
    });
  } catch (error) {
    console.error('NEAR signature verification failed', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const accountId = String(body.accountId || '').trim();
    const message = String(body.message || '');
    const signature = body.signature;

    if (!accountId || !message || !signature) {
      return NextResponse.json({ error: 'Missing wallet signin fields' }, { status: 400 });
    }

    const isValid = await verifyNearSignature(accountId, message, signature);

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid NEAR wallet signature' }, { status: 401 });
    }

    const email = deriveWalletEmail(accountId);
    const password = deriveWalletPassword(accountId);

    const adminClient = createSupabaseAdminClient();
    const publicClient = getPublicSupabaseClient();

    const { data: existingUser } = await adminClient
      .from('users')
      .select('id')
      .eq('near_wallet_address', accountId)
      .maybeSingle();

    let userId: string | undefined = existingUser?.id;

    if (!userId) {
      const createUserResult = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          auth_type: 'wallet',
          near_wallet_address: accountId,
        },
      });

      if (createUserResult.error || !createUserResult.data.user) {
        throw new Error(createUserResult.error?.message || 'Failed to create wallet user');
      }

      userId = createUserResult.data.user.id;

      const { error: insertError } = await adminClient.from('users').insert({
        id: userId,
        email,
        near_wallet_address: accountId,
        auth_type: 'wallet',
        full_name: accountId,
        onboarding_completed: false,
      });

      if (insertError) throw insertError;
    }

    const signinResult = await publicClient.auth.signInWithPassword({
      email,
      password,
    });

    if (signinResult.error || !signinResult.data.session) {
      throw new Error(signinResult.error?.message || 'Failed to create Supabase session');
    }

    return NextResponse.json({
      success: true,
      userId,
      session: {
        access_token: signinResult.data.session.access_token,
        refresh_token: signinResult.data.session.refresh_token,
        expires_at: signinResult.data.session.expires_at,
        token_type: signinResult.data.session.token_type,
      },
    });
  } catch (error: any) {
    console.error('Wallet sign-in error', error);
    return NextResponse.json({ error: error.message || 'Wallet sign-in failed' }, { status: 500 });
  }
}
