/**
 * Environment access.
 *
 * Vite inlines `import.meta.env.*` at build time, so these must be referenced
 * as full static property accesses - a dynamic `env[key]` lookup would be
 * `undefined` in the production bundle.
 */

const raw = {
  url: import.meta.env.VITE_SUPABASE_URL as string | undefined,
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined,
}

const PLACEHOLDER = /your-project-ref|your-anon-or-publishable-key/i

/**
 * Validate Supabase config at module load.
 *
 * Failing here with an actionable message beats letting `createClient` throw
 * an opaque "supabaseUrl is required" deep inside a component tree, or worse -
 * rendering a blank page because every query silently fails.
 */
function readConfig(): { url: string; anonKey: string } {
  const { url, anonKey } = raw

  if (!url || !anonKey || PLACEHOLDER.test(url) || PLACEHOLDER.test(anonKey)) {
    throw new Error(
      [
        'StockSense is not configured yet.',
        '',
        'Add your Supabase credentials to a `.env.local` file in the project root:',
        '',
        '  VITE_SUPABASE_URL=https://<project-ref>.supabase.co',
        '  VITE_SUPABASE_ANON_KEY=<your anon key>',
        '',
        'Then restart the dev server. See `.env.example` for the template.',
      ].join('\n'),
    )
  }

  return { url, anonKey }
}

export const supabaseConfig = readConfig()

export const isSupabaseConfigured = Boolean(
  raw.url && raw.anonKey && !PLACEHOLDER.test(raw.url) && !PLACEHOLDER.test(raw.anonKey),
)
