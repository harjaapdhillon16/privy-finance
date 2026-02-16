'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Mail, Wallet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function LoginPage() {
  const router = useRouter();
  const { signInWithEmail, connectWallet, signInWithWallet, nearAccount } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      await signInWithEmail(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleWalletConnect = async () => {
    setLoading(true);
    setError('');

    try {
      await connectWallet();
    } catch (err: any) {
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setLoading(false);
    }
  };

  const handleWalletLogin = async () => {
    setLoading(true);
    setError('');

    try {
      await signInWithWallet();
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in with wallet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-600">
            <span className="text-2xl font-bold text-white">P</span>
          </div>
          <CardTitle className="text-2xl">Welcome to Privy Finance</CardTitle>
          <CardDescription>Your AI-powered financial advisor. Completely private.</CardDescription>
        </CardHeader>

        <CardContent>
          {error ? (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Tabs defaultValue="email" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="email">
                <Mail className="mr-2 h-4 w-4" />
                Email
              </TabsTrigger>
              <TabsTrigger value="wallet">
                <Wallet className="mr-2 h-4 w-4" />
                Wallet
              </TabsTrigger>
            </TabsList>

            <TabsContent value="email" className="space-y-4">
              <form onSubmit={handleEmailLogin} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Sign In
                </Button>
              </form>

              <div className="text-center text-sm text-gray-600">
                Don&apos;t have an account?{' '}
                <Link href="/signup" className="text-blue-600 hover:underline">
                  Sign up
                </Link>
              </div>
            </TabsContent>

            <TabsContent value="wallet" className="space-y-4">
              {!nearAccount ? (
                <div className="space-y-4">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <h3 className="mb-2 font-medium">Connect NEAR Wallet</h3>
                    <p className="mb-4 text-sm text-gray-600">
                      Sign in securely using your NEAR wallet. No password required.
                    </p>
                    <Button onClick={handleWalletConnect} className="w-full" disabled={loading} type="button">
                      {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wallet className="mr-2 h-4 w-4" />}
                      Connect Wallet
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-medium text-green-900">Wallet Connected</h3>
                      <div className="h-2 w-2 rounded-full bg-green-500" />
                    </div>
                    <p className="font-mono text-sm text-green-800">{nearAccount.accountId}</p>
                  </div>

                  <Button onClick={handleWalletLogin} className="w-full" disabled={loading} type="button">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Sign In with Wallet
                  </Button>
                </div>
              )}

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                Wallet login uses cryptographic signatures. Private keys never leave your wallet.
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
