// /src/middleware.ts
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

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
        set: (key, value, options) => {
          res.cookies.set({ name: key, value, ...options });
        },
        remove: (key, options) => {
          res.cookies.set({ name: key, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );
  return { supabase, res };
}

export default async function middleware(req: NextRequest) {
  const { supabase, res } = makeClient(req);
  const url = new URL(req.url);
  const path = url.pathname;

  const loginRedirect = (reason: string) =>
    NextResponse.redirect(
      new URL(
        `/login?reason=${encodeURIComponent(reason)}&next=${encodeURIComponent(path)}`,
        req.url
      )
    );

  // 1) Require session
  const { data: sessionRes } = await supabase.auth.getSession();
  const email = sessionRes.session?.user?.email?.toLowerCase();
  if (!email) return loginRedirect("no-session");

  // 2) Block check (applies to everyone, including admins)
  const { data: blocked, error: blErr } = await supabase
    .from("blocked_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (!blErr && blocked?.email) {
    try {
      await supabase.auth.signOut();
    } catch {}
    return loginRedirect("blocked");
  }

  // 3) Admin check (requires admins_self_select policy)
  const { data: adm, error: adErr } = await supabase
    .from("admins")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  const isAdmin = !adErr && !!adm?.email;

  // 4) If admin: allow (even if not in allow-list). If non-admin: must be allow-listed.
  if (!isAdmin) {
    const { data: allow, error: alErr } = await supabase
      .from("email_allowlist")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (alErr) return loginRedirect("allowlist-rls-error");
    if (!allow?.email) return loginRedirect("not-allowlisted");
  }

  // 5) If trying to access admin dashboard but not admin, send to client dashboard
  if (path.startsWith("/admin-dashboard") && !isAdmin) {
    return NextResponse.redirect(new URL("/client-dashboard", req.url));
  }

  return res;
}
