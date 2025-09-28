// /src/middleware.ts
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const config = {
  matcher: ["/client-dashboard", "/admin-dashboard"], // protect only dashboards
};

export default async function middleware(req: NextRequest) {
  // We’ll return this response (so cookie updates get sent back)
  const res = NextResponse.next({ request: { headers: req.headers } });
  const url = new URL(req.url);

  // Helper to redirect to login with a reason + next parameter
  const toLogin = (reason: string) => {
    const params = new URLSearchParams();
    params.set("next", url.pathname);
    params.set("reason", reason);
    return NextResponse.redirect(new URL(`/login?${params.toString()}`, req.url));
  };

  // Create a Supabase client that reads/writes cookies inside middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          res.cookies.set(name, value, options);
        },
        remove: (name: string, options: CookieOptions) => {
          res.cookies.set(name, "", { ...options, maxAge: 0 });
        },
      },
    }
  );

  // 1) Must be signed in
  const { data: userRes } = await supabase.auth.getUser();
  const user = userRes?.user;
  if (!user) return toLogin("signin");

  const email = (user.email || "").toLowerCase();

  // 2) Admin dashboard needs admin
  if (url.pathname === "/admin-dashboard") {
    const { data: adminRow, error: adminErr } = await supabase
      .from("admins")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (adminErr || !adminRow) return toLogin("not_admin");
    return res; // allow through
  }

  // 3) Client dashboard: block > allow
  // Blocked?
  const { data: blRow } = await supabase
    .from("blocked_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (blRow) {
    // Kill session so the user is *really* out
    await supabase.auth.signOut();
    return toLogin("blocked");
  }

  // Allow-listed?
  const { data: alRow } = await supabase
    .from("email_allowlist")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (!alRow) return toLogin("not_allowed");

  // OK to proceed
  return res;
}

