// src/lib/supabaseAdmin.ts
// src/lib/supabaseAdmin.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } }
);

export { supabaseAdmin };
export default supabaseAdmin;
