import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
// Accept multiple env var names for compatibility
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

export const supabase = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  : null;

export function assertSupabase() {
  if (!supabase) throw new Error('Supabase not configured');
}

// Soft warning if key is not a service role key (uploads may fail with anon keys)
try {
  if (SUPABASE_SERVICE_KEY) {
    const part = SUPABASE_SERVICE_KEY.split('.')[1];
    if (part) {
      const json = JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (json?.role && json.role !== 'service_role') {
        console.warn('[Supabase] Using a non-service key (role:', json.role, '). Server-side uploads may fail without permissive Storage policies.');
      }
    }
  }
} catch { /* ignore */ }
