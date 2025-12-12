// src/lib/xero.ts
// src/lib/xero.ts
import { XeroClient, TokenSet } from "xero-node";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

function buildXeroClient() {
  if (!process.env.XERO_CLIENT_ID || !process.env.XERO_CLIENT_SECRET || !process.env.XERO_REDIRECT_URI) {
    throw new Error("Xero env vars missing (XERO_CLIENT_ID/SECRET/REDIRECT_URI)");
  }

  const scopes = (process.env.XERO_SCOPES || "").split(" ").filter(Boolean);
  if (!scopes.includes("offline_access")) {
    // Without offline_access you won't get a refresh token.
    throw new Error("XERO_SCOPES must include offline_access");
  }

  return new XeroClient({
    clientId: process.env.XERO_CLIENT_ID,
    clientSecret: process.env.XERO_CLIENT_SECRET,
    redirectUris: [process.env.XERO_REDIRECT_URI],
    scopes,
  });
}

async function loadTokenSet(): Promise<TokenSet | null> {
  // 1) Prefer Supabase store (persistent)
  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from("xero_token_store")
      .select("token_set")
      .eq("id", 1)
      .single();

    if (!error && data?.token_set && Object.keys(data.token_set).length) {
      return data.token_set as TokenSet;
    }
  }

  // 2) Fallback to env (bootstrap only)
  const raw = process.env.XERO_TOKEN_SET;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TokenSet;
  } catch {
    throw new Error("XERO_TOKEN_SET is not valid JSON");
  }
}

async function saveTokenSet(tokenSet: TokenSet) {
  if (!supabaseAdmin) return;

  const { error } = await supabaseAdmin
    .from("xero_token_store")
    .upsert({ id: 1, token_set: tokenSet, updated_at: new Date().toISOString() });

  if (error) throw new Error(`Failed to persist Xero token set: ${error.message}`);
}

function isExpired(tokenSet: any) {
  // xero-node typically uses expires_at (unix seconds). Be tolerant.
  const expiresAt = tokenSet?.expires_at;
  if (!expiresAt) return false;
  const now = Math.floor(Date.now() / 1000);
  return now >= (Number(expiresAt) - 60); // refresh 60s early
}

/**
 * Returns an initialized Xero client with a fresh token set.
 * If token is expired/invalid, it refreshes and persists the new token set.
 */
export async function getXeroClient() {
  const xero = buildXeroClient();
  await xero.initialize();

  const tokenSet = await loadTokenSet();
  if (!tokenSet) {
    throw new Error(
      "No Xero token set found. You must connect Xero once and store the token set."
    );
  }

  xero.setTokenSet(tokenSet);

  // Refresh proactively if expired
  if (isExpired(tokenSet)) {
    const newTokenSet = await xero.refreshToken();
    xero.setTokenSet(newTokenSet);
    await saveTokenSet(newTokenSet);
  }

  return xero;
}

/**
 * Helper: if an API call returns 401 invalid_token, refresh and retry once.
 */
export async function withXeroRetry<T>(fn: (xero: XeroClient) => Promise<T>): Promise<T> {
  const xero = await getXeroClient();
  try {
    return await fn(xero);
  } catch (err: any) {
    const msg = String(err?.response?.data?.error || err?.message || err);
    const status = err?.response?.status;

    if (status === 401 || msg.includes("invalid_token") || msg.includes("TokenExpired")) {
      const newTokenSet = await xero.refreshToken();
      xero.setTokenSet(newTokenSet);
      await saveTokenSet(newTokenSet);
      return await fn(xero);
    }
    throw err;
  }
}
