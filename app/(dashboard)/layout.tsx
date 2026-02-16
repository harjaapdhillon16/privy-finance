'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';
import { OnboardingModal } from '@/components/onboarding/OnboardingModal';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, supabaseLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!supabaseLoading && !user) {
      router.push('/login');
    }
  }, [supabaseLoading, user, router]);

  if (supabaseLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="lg:pl-64">
        <Header />
        <main className="p-6">{children}</main>
      </div>
      <OnboardingModal />
    </div>
  );
}
