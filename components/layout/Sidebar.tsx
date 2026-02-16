'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, FileText, FolderOpen, Lightbulb, Target, Settings, LogOut, MessageSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

const navigation = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Transactions', href: '/dashboard/transactions', icon: FileText },
  { name: 'Documents', href: '/dashboard/documents', icon: FolderOpen },
  { name: 'Optimization', href: '/dashboard/optimization', icon: Lightbulb },
  { name: 'Talk To My Data', href: '/dashboard/talk-to-my-data', icon: MessageSquare },
  { name: 'Goals', href: '/dashboard/goals', icon: Target },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

interface OnboardingStatusResponse {
  onboardingData: {
    data_of_user?: {
      fullName?: string;
    };
  } | null;
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const [onboardingName, setOnboardingName] = useState('');

  useEffect(() => {
    let canceled = false;

    async function loadOnboardingName() {
      try {
        const response = await fetch('/api/onboarding', { cache: 'no-store' });
        if (!response.ok) return;

        const payload = (await response.json()) as OnboardingStatusResponse;
        const fullName = payload.onboardingData?.data_of_user?.fullName?.trim();

        if (!canceled && fullName) {
          setOnboardingName(fullName);
        }
      } catch {
        // Silently fallback to other identity fields in sidebar.
      }
    }

    if (user?.id) {
      loadOnboardingName();
    }

    return () => {
      canceled = true;
    };
  }, [user?.id]);

  const displayName = useMemo(
    () =>
      onboardingName ||
      user?.user_metadata?.full_name ||
      user?.email ||
      user?.user_metadata?.near_wallet_address ||
      'Wallet User',
    [onboardingName, user?.email, user?.user_metadata?.full_name, user?.user_metadata?.near_wallet_address],
  );

  return (
    <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
      <div className="flex grow flex-col overflow-y-auto border-r border-gray-200 bg-white px-3 py-5">
        <div className="mb-8 flex items-center px-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600">
            <span className="text-xl font-bold text-white">P</span>
          </div>
          <span className="ml-3 text-xl font-bold text-gray-900">Privy Finance</span>
        </div>

        <nav className="flex-1 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'group flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-700 hover:bg-gray-50 hover:text-gray-900',
                )}
              >
                <item.icon
                  className={cn(
                    'mr-3 h-5 w-5 flex-shrink-0',
                    isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-500',
                  )}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 border-t border-gray-200 pt-4">
          <div className="flex items-center">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{displayName}</p>
              <p className="truncate text-xs text-gray-500">
                {user?.user_metadata?.auth_type === 'wallet' ? 'NEAR Wallet' : 'Email'}
              </p>
            </div>
            <button
              onClick={signOut}
              className="ml-2 rounded-lg p-2 transition-colors hover:bg-gray-100"
              title="Sign out"
              type="button"
            >
              <LogOut className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
