// /src/middleware.ts
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const config = {
  matcher: ["/client-dashboard", "/admin-dashboard"],
};

function makeClient(req: NextRequest) {
  let res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (key) => req.cookies.get(key)?.value,
        set: (key, value, options) => { res.cookies.set({ name: key, value, ...options }); },
        remove: (key, options) => { res.cookies.set({ name: key, value: "", ...options, maxAge: 0 }); },
      },
    }
  );
  return { supabase, res };
}

export default async function middleware(req: NextRequest) {
  const { supabase, res } = makeClient(req);
  const url = new URL(req.url);
  const path = url.pathname;

  const { data: sessionRes } = await supabase.auth.getSession();
  const email = sessionRes.session?.user?.email?.toLowerCase();

  const goLogin = (reason: string) =>
    NextResponse.redirect(new URL(`/login?reason=${encodeURIComponent(reason)}&next=${encodeURIComponent(path)}`, req.url));

  if (!email) return goLogin("no-session");

  const { data: bl, error: blErr } = await supabase
    .from("blocked_users").select("email").eq("email", email).maybeSingle();
  if (!blErr && bl?.email) {
    try { await supabase.auth.signOut(); } catch {}
    return goLogin("blocked");
  }

  const { data: al, error: alErr } = await supabase
    .from("email_allowlist").select("email").eq("email", email).maybeSingle();
  if (alErr)   return goLogin("allowlist-rls-error");
  if (!al?.email) return goLogin("not-allowlisted");

  if (path.startsWith("/admin-dashboard")) {
    const { data: ad, error: adErr } = await supabase
      .from("admins").select("email").eq("email", email).maybeSingle();
    if (adErr)      return goLogin("admin-rls-error");
    if (!ad?.email) return NextResponse.redirect(new URL("/client-dashboard", req.url));
  }

  return res;
}

