// src/lib/supabaseAdmin.ts
// src/lib/supabaseAdmin.ts
// src/lib/supabaseAdmin.ts
import "server-only";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!url) throw new Error("Missing env NEXT_PUBLIC_SUPABASE_URL");
if (!serviceRoleKey) throw new Error("Missing env SUPABASE_SERVICE_ROLE_KEY");

// create a single admin client
const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Named export (preferred in new code)
export const supabaseAdmin = admin;
// Default export (keeps older imports working)
export default admin;
