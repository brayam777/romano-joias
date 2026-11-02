import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Standalone Supabase project for Romano Joias, under the
// barayamgamer@gmail.com Supabase account.
const SUPABASE_URL = 'https://yjegibnteupkskgeqdum.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_Z_BI_xjty_SCqVi5MjiWiA_Y3mXmBwy';

export const isConfigured = SUPABASE_URL !== 'PENDING_SETUP';

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: 'implicit' } })
  : null;
