// src/lib/supabase-server.ts
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { NextApiRequest, NextApiResponse } from "next";
import type { GetServerSidePropsContext } from "next";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function getServerSupabase(ctx: GetServerSidePropsContext) {
  const { req, res } = ctx;

  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      get(name: string) {
        return req.cookies[name];
      },
      set(name: string, value: string, options: CookieOptions) {
        // Write back auth cookie updates
        res.setHeader("Set-Cookie", `${name}=${value}; Path=/; HttpOnly; SameSite=Lax${options.maxAge ? `; Max-Age=${options.maxAge}` : ""}${options.expires ? `; Expires=${options.expires.toUTCString()}` : ""}${options.secure ? "; Secure" : ""}`);
      },
      remove(name: string, options: CookieOptions) {
        res.setHeader(
          "Set-Cookie",
          `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${options.secure ? "; Secure" : ""}`
        );
      },
    },
  });
}
