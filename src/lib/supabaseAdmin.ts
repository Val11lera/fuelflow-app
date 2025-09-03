// src/lib/supabaseAdmin.ts
// src/lib/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  {
    auth: { persistSession: false },
  }
);

export default supabaseAdmin;
