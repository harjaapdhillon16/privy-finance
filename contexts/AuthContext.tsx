'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import { setupWalletSelector } from '@near-wallet-selector/core';
import { setupModal } from '@near-wallet-selector/modal-ui';
import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet';
import { setupHereWallet } from '@near-wallet-selector/here-wallet';
import { setupMeteorWallet } from '@near-wallet-selector/meteor-wallet';
import type { WalletSelector } from '@near-wallet-selector/core';
import type { User } from '@supabase/supabase-js';

interface NearAccount {
  accountId: string;
}

interface AuthContextType {
  user: User | null;
  supabaseLoading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
  walletSelector: WalletSelector | null;
  nearAccount: NearAccount | null;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  signInWithWallet: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const modalRef = useRef<ReturnType<typeof setupModal> | null>(null);

  const [supabase, setSupabase] = useState<ReturnType<typeof createSupabaseBrowserClient> | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [supabaseLoading, setSupabaseLoading] = useState(true);
  const [walletSelector, setWalletSelector] = useState<WalletSelector | null>(null);
  const [nearAccount, setNearAccount] = useState<NearAccount | null>(null);

  useEffect(() => {
    setSupabase(createSupabaseBrowserClient());
  }, []);

  useEffect(() => {
    if (!supabase) return;

    let mounted = true;

    const initAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (mounted) {
        setUser(session?.user ?? null);
        setSupabaseLoading(false);
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    let disposed = false;

    const initWallet = async () => {
      try {
        const selector = await setupWalletSelector({
          network: (process.env.NEXT_PUBLIC_NEAR_NETWORK as 'mainnet' | 'testnet') || 'mainnet',
          modules: [setupMyNearWallet(), setupHereWallet(), setupMeteorWallet()],
        });

        if (disposed) return;

        setWalletSelector(selector);
        modalRef.current = setupModal(selector, {
          contractId: '',
        });

        const state = selector.store.getState();
        const account = state.accounts?.find((item: any) => item.active);
        if (account) {
          setNearAccount({ accountId: account.accountId });
        }

        const unsubscribe = selector.store.observable.subscribe((nextState: any) => {
          const active = nextState.accounts?.find((item: any) => item.active);
          setNearAccount(active ? { accountId: active.accountId } : null);
        });

        return () => unsubscribe.unsubscribe();
      } catch (error) {
        console.error('Wallet selector init failed', error);
      }
    };

    const cleanupPromise = initWallet();

    return () => {
      disposed = true;
      Promise.resolve(cleanupPromise).then((cleanup) => cleanup?.());
    };
  }, []);

  const signInWithEmail = async (email: string, password: string) => {
    if (!supabase) throw new Error('Supabase client not ready');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signUpWithEmail = async (email: string, password: string, fullName: string) => {
    if (!supabase) throw new Error('Supabase client not ready');
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          auth_type: 'email',
        },
      },
    });

    if (error) throw error;

    if (data.user) {
      const { error: upsertError } = await supabase.from('users').upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        auth_type: 'email',
        onboarding_completed: false,
      });

      if (upsertError) throw upsertError;
    }
  };

  const signOut = async () => {
    if (!supabase) throw new Error('Supabase client not ready');
    await supabase.auth.signOut();

    if (walletSelector?.isSignedIn()) {
      const wallet = await walletSelector.wallet();
      await wallet.signOut();
    }

    setNearAccount(null);
  };

  const connectWallet = async () => {
    if (!modalRef.current) {
      throw new Error('Wallet selector not initialized');
    }

    modalRef.current.show();
  };

  const disconnectWallet = async () => {
    if (!walletSelector) return;

    const wallet = await walletSelector.wallet();
    await wallet.signOut();
    setNearAccount(null);
  };

  const signInWithWallet = async () => {
    if (!supabase) throw new Error('Supabase client not ready');
    if (!walletSelector) throw new Error('Wallet selector not initialized');
    if (!nearAccount) throw new Error('No wallet connected');

    const message = `Sign in to Privy Finance\\nTimestamp: ${Date.now()}`;
    const wallet = await walletSelector.wallet();

    const signature = await (wallet as any).signMessage({
      message,
      recipient: nearAccount.accountId,
    });

    const response = await fetch('/api/auth/wallet-signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: nearAccount.accountId,
        message,
        signature,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Wallet sign in failed');
    }

    const { session } = payload;

    if (!session?.access_token || !session?.refresh_token) {
      throw new Error('Invalid wallet auth response');
    }

    const { error } = await supabase.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });

    if (error) throw error;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        supabaseLoading,
        signInWithEmail,
        signUpWithEmail,
        signOut,
        walletSelector,
        nearAccount,
        connectWallet,
        disconnectWallet,
        signInWithWallet,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}
