import './globals.css';
import '@near-wallet-selector/modal-ui/styles.css';
import type { Metadata } from 'next';
import { AuthProvider } from '@/contexts/AuthContext';
import { QueryProvider } from '@/providers/query-provider';

export const metadata: Metadata = {
  title: 'Privy Finance',
  description: 'Private AI-powered finance optimization using Nova + NEAR AI + Supabase',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <QueryProvider>
          <AuthProvider>{children}</AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
