import { cookies } from 'next/headers';
import { createRouteHandlerClient, createServerComponentClient } from '@supabase/auth-helpers-nextjs';

export type Database = any;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'public-anon-key-placeholder';

export function createRouteHandlerSupabaseClient() {
  return createRouteHandlerClient<Database>(
    { cookies },
    {
      supabaseUrl,
      supabaseKey,
    },
  );
}

export function createServerSupabaseClient() {
  return createServerComponentClient<Database>(
    { cookies },
    {
      supabaseUrl,
      supabaseKey,
    },
  );
}
