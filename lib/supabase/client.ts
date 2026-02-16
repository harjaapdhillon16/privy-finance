'use client';

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export type Database = any;

export function createSupabaseBrowserClient() {
  return createClientComponentClient<Database>({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key-placeholder',
  });
}
