// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

export const supabaseBrowser =
  typeof window !== "undefined"
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || "",
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
      )
    : null as any;

export const PDF_BUCKET = "contracts"; // <— change if you used a different bucket name

export function publicFileUrl(path?: string | null) {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  // public objects path
  return `${base}/storage/v1/object/public/${PDF_BUCKET}/${path}`;
}
