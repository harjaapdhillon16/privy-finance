import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nacl from 'tweetnacl';
import { providers, utils } from 'near-api-js';
import { verifySignature as verifyNep413Signature } from '@near-wallet-selector/core';
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

function decodeSignatureString(value: string): Uint8Array {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error('Missing signature value');
  }

  if (normalized.startsWith('ed25519:')) {
    return utils.serialize.base_decode(normalized.slice('ed25519:'.length));
  }

  const normalizedBase64 = normalized.replace(/-/g, '+').replace(/_/g, '/');
  const decodedBase64 = Buffer.from(normalizedBase64, 'base64');
  if (decodedBase64.length === 64) {
    return decodedBase64;
  }

  try {
    const decodedBase58 = utils.serialize.base_decode(normalized);
    if (decodedBase58.length > 0) {
      return decodedBase58;
    }
  } catch {
    // Continue and return base64-decoded fallback below.
  }

  return decodedBase64;
}

function extractSignature(signature: any): Uint8Array {
  if (!signature) throw new Error('Missing signature payload');

  if (typeof signature === 'string') {
    return decodeSignatureString(signature);
  }

  if (typeof signature.signature === 'string') {
    return decodeSignatureString(signature.signature);
  }

  if (Array.isArray(signature.signature)) {
    return Uint8Array.from(signature.signature);
  }

  throw new Error('Invalid signature format');
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function extractNonce(nonceValue: unknown): Uint8Array | null {
  if (typeof nonceValue !== 'string' || !nonceValue.trim()) return null;

  const decoded = Buffer.from(nonceValue, 'base64');
  if (decoded.length !== 32) return null;
  return decoded;
}

function collectRecipientCandidates(params: {
  providedRecipient?: string;
  accountId: string;
  callbackUrl?: string;
}) {
  const recipients = new Set<string>();
  const providedRecipient = normalizeOptionalString(params.providedRecipient);
  const callbackUrl = normalizeOptionalString(params.callbackUrl);

  recipients.add(params.accountId);
  if (providedRecipient) {
    recipients.add(providedRecipient);
  }

  if (callbackUrl) {
    try {
      const parsed = new URL(callbackUrl);
      recipients.add(parsed.host);
      recipients.add(parsed.hostname);
      recipients.add(parsed.origin);
    } catch {
      // Ignore invalid callback URL values.
    }
  }

  const appUrl = normalizeOptionalString(process.env.NEXT_PUBLIC_APP_URL);
  if (appUrl) {
    try {
      const parsed = new URL(appUrl);
      recipients.add(parsed.host);
      recipients.add(parsed.hostname);
      recipients.add(parsed.origin);
    } catch {
      // Ignore invalid app URL values.
    }
  }

  return Array.from(recipients).filter(Boolean);
}

function collectCallbackCandidates(callbackUrl?: string) {
  const candidates = new Set<string | undefined>();
  const normalized = normalizeOptionalString(callbackUrl);
  candidates.add(undefined);

  if (normalized) {
    candidates.add(normalized);
  }

  return Array.from(candidates);
}

async function verifyNearSignature(
  accountId: string,
  message: string,
  signature: any,
  options?: {
    nonce?: string;
    recipient?: string;
    callbackUrl?: string;
  },
): Promise<boolean> {
  try {
    const rpcUrl = process.env.NEXT_PUBLIC_NEAR_HELPER_URL || 'https://rpc.mainnet.near.org';
    const provider = new providers.JsonRpcProvider({ url: rpcUrl });

    const accessKeys: any = await provider.query({
      request_type: 'view_access_key_list',
      finality: 'final',
      account_id: accountId,
    });

    const signatureBytes = extractSignature(signature);
    const signatureBase64 = Buffer.from(signatureBytes).toString('base64');
    const keys = accessKeys?.keys || [];
    const nonce = extractNonce(options?.nonce);
    const recipients = collectRecipientCandidates({
      providedRecipient: options?.recipient,
      accountId,
      callbackUrl: options?.callbackUrl,
    });
    const callbackCandidates = collectCallbackCandidates(options?.callbackUrl);

    if (nonce && recipients.length > 0) {
      const nonceBuffer = Buffer.from(nonce);

      for (const entry of keys) {
        const publicKey = entry?.public_key as string;
        if (!publicKey?.startsWith('ed25519:')) continue;

        for (const recipient of recipients) {
          for (const callbackUrl of callbackCandidates) {
            try {
              const isValid = verifyNep413Signature({
                publicKey,
                signature: signatureBase64,
                message,
                nonce: nonceBuffer,
                recipient,
                callbackUrl,
              });

              if (isValid) {
                return true;
              }
            } catch {
              // Continue trying other recipient/callback permutations.
            }
          }
        }
      }
    }

    // Legacy fallback for wallets signing plain message bytes.
    const messageBytes = new TextEncoder().encode(message);

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
    const nonce = typeof body.nonce === 'string' ? body.nonce : undefined;
    const recipient = typeof body.recipient === 'string' ? body.recipient : undefined;
    const callbackUrl = typeof body.callbackUrl === 'string' ? body.callbackUrl : undefined;
    const signature = body.signature;

    if (!accountId || !message || !signature) {
      return NextResponse.json({ error: 'Missing wallet signin fields' }, { status: 400 });
    }

    const isValid = await verifyNearSignature(accountId, message, signature, {
      nonce,
      recipient,
      callbackUrl,
    });

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
