'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  Search,
  LayoutDashboard,
  FileText,
  FolderOpen,
  Lightbulb,
  MessageSquare,
  Target,
  Settings,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const mobileNavigation = [
  { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Transactions', href: '/dashboard/transactions', icon: FileText },
  { name: 'Documents', href: '/dashboard/documents', icon: FolderOpen },
  { name: 'Optimize', href: '/dashboard/optimization', icon: Lightbulb },
  { name: 'Talk', href: '/dashboard/talk-to-my-data', icon: MessageSquare },
  { name: 'Goals', href: '/dashboard/goals', icon: Target },
  { name: 'Settings', href: '/dashboard/settings', icon: Settings },
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="w-full max-w-lg">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input type="search" placeholder="Search transactions, insights..." className="pl-10" />
            </div>
          </div>

          <Button variant="ghost" size="icon" className="relative" type="button">
            <Bell className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" />
          </Button>
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-1 lg:hidden">
          {mobileNavigation.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  isActive
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                )}
              >
                <item.icon className="h-3.5 w-3.5" />
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
