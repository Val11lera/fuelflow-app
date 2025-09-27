// /src/middleware.ts
// src/middleware.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Only guard the private pages. DO NOT include /login in the matcher.
export const config = {
  matcher: [
    "/client-dashboard",
    "/admin-dashboard",
    // add more private pages here if you have them
    // e.g. "/orders", "/invoices", "/contracts"
  ],
};

function makeClient(req: NextRequest) {
  // Adapters to let @supabase/ssr read/write cookies in middleware
  let res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (key: string) => req.cookies.get(key)?.value,
        set: (key: string, value: string, options: CookieOptions) => {
          res.cookies.set({ name: key, value, ...options });
        },
        remove: (key: string, options: CookieOptions) => {
          res.cookies.set({ name: key, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );
  return { supabase, res };
}

export default async function middleware(req: NextRequest) {
  // Never guard api/static/etc — that's handled by config.matcher above.
  const url = new URL(req.url);
  const pathname = url.pathname;

  const { supabase, res } = makeClient(req);

  // 0) Must be signed in
  const { data: sessionRes } = await supabase.auth.getSession();
  const email = sessionRes.session?.user?.email?.toLowerCase();

  if (!email) {
    const to = `/login?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(new URL(to, req.url));
  }

  // 1) If blocked -> force logout + send to login with reason
  const { data: bl, error: blErr } = await supabase
    .from("blocked_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (!blErr && bl?.email) {
    // best-effort sign out; ignore errors in middleware
    try {
      await supabase.auth.signOut();
    } catch {}
    const to = `/login?blocked=1&next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(new URL(to, req.url));
  }

  // 2) Must be approved (on allowlist) to reach dashboards
  const { data: al, error: alErr } = await supabase
    .from("email_allowlist")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (alErr || !al?.email) {
    const to = `/login?pending=1&next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(new URL(to, req.url));
  }

  // 3) If requesting /admin-dashboard, verify admin
  if (pathname.startsWith("/admin-dashboard")) {
    const { data: admin, error: adminErr } = await supabase
      .from("admins")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (adminErr || !admin?.email) {
      // Not an admin: send to client dashboard instead
      return NextResponse.redirect(new URL("/client-dashboard", req.url));
    }
  }

  // 4) All good -> continue and pass through any cookie updates
  return res;
}
