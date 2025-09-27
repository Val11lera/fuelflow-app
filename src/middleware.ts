// /src/middleware.ts
// /src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const PROTECTED_PATHS = [
  "/client-dashboard",
  "/orders",
  "/invoices",
  "/contracts",
  // add any other client pages that require approval
];

function isProtectedPath(pathname: string) {
  // allow login, register, api, static assets, etc.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/fonts") ||
    pathname.startsWith("/images") ||
    pathname === "/login" ||
    pathname === "/"
  ) {
    return false;
  }
  return PROTECTED_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({
    headers: {
      // avoid any intermediary caching decisions on this guard
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });

  if (!isProtectedPath(req.nextUrl.pathname)) {
    return res;
  }

  // Supabase SSR client (reads auth cookies)
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  // 1) Must be authenticated
  const { data: sessionData } = await supabase.auth.getSession();
  const email = sessionData?.session?.user?.email?.toLowerCase();
  if (!email) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // 2) Blocked?
  const { data: bl, error: blErr } = await supabase
    .from("blocked_users")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (!blErr && bl?.email) {
    // sign out (best effort) and send to login with message
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("blocked", "1");
    return NextResponse.redirect(url);
  }

  // 3) Approved (allow-listed)?
  const { data: al, error: alErr } = await supabase
    .from("email_allowlist")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  if (alErr || !al?.email) {
    // not approved yet → redirect to login with pending flag
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("pending", "1");
    return NextResponse.redirect(url);
  }

  // ok to proceed
  return res;
}

export const config = {
  matcher: [
    // run on all pages; early-return in code for public ones
    "/((?!.*\\.).*)",
  ],
};

