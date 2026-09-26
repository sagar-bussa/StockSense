import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './env'
import type { Database } from './types'

/**
 * The single browser-side Supabase client.
 *
 * This uses the **anon / publishable** key only. It is designed to be public
 * and is made safe by Row Level Security: every table and every RPC is guarded
 * by policies, and all stock mutation happens inside `SECURITY DEFINER`
 * functions. There is deliberately no service-role client in this codebase -
 * a service-role key in the browser would bypass RLS entirely and hand anyone
 * who opened devtools a full read/write database.
 */
export const supabase = createClient<Database>(
  supabaseConfig.url,
  supabaseConfig.anonKey,
  {
    auth: {
      // Keep the session in localStorage so a refresh keeps the user signed in.
      persistSession: true,
      autoRefreshToken: true,
      // Supabase's built-in cross-tab tab sync.
      detectSessionInUrl: true,
      flowType: 'pkce',
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: { 'x-application-name': 'stocksense' },
    },
  },
)
