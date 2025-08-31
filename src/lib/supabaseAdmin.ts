// src/lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role (server only)

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
export default supabase;
