// src/lib/supabase.ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url || !key) {
  // This will show up in your dev server logs
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
