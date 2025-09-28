// src/lib/supabase-server.ts
import type { GetServerSidePropsContext } from "next";
import { createServerClient } from "@supabase/ssr";
import * as cookie from "cookie";

/**
 * Server-side Supabase client that *persists* the auth session via cookies.
 * This is critical for RLS policies that rely on auth.email() during SSR.
 */
export function getServerSupabase(ctx: GetServerSidePropsContext) {
  const { req, res } = ctx;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          const raw = req.headers.cookie ?? "";
          const parsed = cookie.parse(raw);
          return parsed[name];
        },
        set(name: string, value: string, options: cookie.CookieSerializeOptions) {
          const serialized = cookie.serialize(name, value, {
            ...options,
            // keep cookies working on your subdomain:
            domain: process.env.AUTH_COOKIE_DOMAIN || ".fuelflow.co.uk",
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: true,
          });
          const prev = res.getHeader("Set-Cookie");
          if (!prev) {
            res.setHeader("Set-Cookie", serialized);
          } else if (Array.isArray(prev)) {
            res.setHeader("Set-Cookie", [...prev, serialized]);
          } else {
            res.setHeader("Set-Cookie", [prev as string, serialized]);
          }
        },
        remove(name: string, options: cookie.CookieSerializeOptions) {
          const serialized = cookie.serialize(name, "", {
            ...options,
            domain: process.env.AUTH_COOKIE_DOMAIN || ".fuelflow.co.uk",
            path: "/",
            httpOnly: true,
            sameSite: "lax",
            secure: true,
            maxAge: 0,
          });
          const prev = res.getHeader("Set-Cookie");
          if (!prev) {
            res.setHeader("Set-Cookie", serialized);
          } else if (Array.isArray(prev)) {
            res.setHeader("Set-Cookie", [...prev, serialized]);
          } else {
            res.setHeader("Set-Cookie", [prev as string, serialized]);
          }
        },
      },
    }
  );

  return supabase;
}
