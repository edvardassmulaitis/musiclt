import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

// Singleton — kad naršyklėje NEbūtų kuriama kelios GoTrueClient instancijos
// tuo pačiu storage raktu ("Multiple GoTrueClient instances" warning).
// Auth persistencija išjungta: appas naudoja NextAuth, ne Supabase auth.
let _publicClient: ReturnType<typeof createClient> | null = null
export function createPublicClient() {
  if (_publicClient) return _publicClient
  _publicClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // Unikalus storageKey — kad NEsutaptų su chat-realtime klientu ir dingtų
    // "Multiple GoTrueClient instances ... same storage key" warning.
    { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'sb-musiclt-public' } }
  )
  return _publicClient
}
