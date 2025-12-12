// src/lib/xero.ts
// src/lib/xero.ts
import { XeroClient, TokenSet } from "xero-node";
import { createClient } from "@supabase/supabase-js";
import { buildCostCentreFromPostcode } from "./cost-centre"; // keep (used elsewhere in your app)

// -----------------------------------------------------------------------------
// Supabase (admin) client
// -----------------------------------------------------------------------------
const supabaseAdmin =
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      })
    : null;

// -----------------------------------------------------------------------------
// Xero client builder
// -----------------------------------------------------------------------------
function buildXeroClient() {
  if (!process.env.XERO_CLIENT_ID || !process.env.XERO_CLIENT_SECRET || !process.env.XERO_REDIRECT_URI) {
    throw new Error("Xero env vars missing (XERO_CLIENT_ID/SECRET/REDIRECT_URI)");
  }

  const scopes = (process.env.XERO_SCOPES || "").split(" ").filter(Boolean);

  // IMPORTANT: without offline_access you won't get a refresh token
  if (!scopes.includes("offline_access")) {
    throw new Error("XERO_SCOPES must include offline_access");
  }

  return new XeroClient({
    clientId: process.env.XERO_CLIENT_ID,
    clientSecret: process.env.XERO_CLIENT_SECRET,
    redirectUris: [process.env.XERO_REDIRECT_URI],
    scopes,
  });
}

// -----------------------------------------------------------------------------
// Token storage helpers
// Table: public.xero_token_store (id=1, token_set jsonb)
// -----------------------------------------------------------------------------
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
  // xero-node uses expires_at (unix seconds) most commonly.
  const expiresAt = tokenSet?.expires_at;
  if (!expiresAt) return false;

  const now = Math.floor(Date.now() / 1000);
  // refresh 60s early
  return now >= Number(expiresAt) - 60;
}

// -----------------------------------------------------------------------------
// Public: Get an initialized Xero client with a fresh token set
// -----------------------------------------------------------------------------
export async function getXeroClient() {
  const xero = buildXeroClient();
  await xero.initialize();

  const tokenSet = await loadTokenSet();
  if (!tokenSet) {
    throw new Error(
      "No Xero token set found. Connect Xero once (or set XERO_TOKEN_SET for bootstrap) and ensure it is saved."
    );
  }

  xero.setTokenSet(tokenSet);

  // proactive refresh if expired
  if (isExpired(tokenSet)) {
    const newTokenSet = await xero.refreshToken();
    xero.setTokenSet(newTokenSet);
    await saveTokenSet(newTokenSet);
  }

  return xero;
}

// -----------------------------------------------------------------------------
// Public: Retry wrapper (refresh & retry once on invalid/expired token)
// -----------------------------------------------------------------------------
export async function withXeroRetry<T>(fn: (xero: XeroClient) => Promise<T>): Promise<T> {
  const xero = await getXeroClient();

  try {
    return await fn(xero);
  } catch (err: any) {
    const status = err?.response?.status;
    const msg = String(err?.response?.data?.error || err?.message || err);

    if (status === 401 || msg.includes("invalid_token") || msg.includes("TokenExpired")) {
      const newTokenSet = await xero.refreshToken();
      xero.setTokenSet(newTokenSet);
      await saveTokenSet(newTokenSet);
      return await fn(xero);
    }

    throw err;
  }
}

// -----------------------------------------------------------------------------
// Backwards-compatible exports (your build is failing without these)
// -----------------------------------------------------------------------------
export type OrderRow = {
  id: string;
  user_email?: string | null;
  name?: string | null;

  // money in pence (from your DB)
  total_pence?: number | null;
  unit_price_pence?: number | null;

  fuel?: string | null;
  litres?: string | number | null;

  created_at?: string | null;
  paid_at?: string | null;
  postcode?: string | null;
};

function poundsFromPence(pence?: number | null) {
  if (pence == null) return undefined;
  return Math.round(pence) / 100;
}

async function getTenantIdOrThrow(xero: any): Promise<string> {
  // If you store a fixed tenant id, use it
  const envTenantId = process.env.XERO_TENANT_ID;
  if (envTenantId) return envTenantId;

  // Otherwise, fetch connected tenants
  const tenants = await xero.updateTenants();
  const tenantId = tenants?.[0]?.tenantId;
  if (!tenantId) {
    throw new Error("No Xero tenant connected. Reconnect Xero and try again.");
  }
  return tenantId;
}

/**
 * Back-compat function your existing route imports.
 * Creates an ACCREC invoice for an order and returns the InvoiceID (string).
 */
export async function createXeroInvoiceForOrder(order: OrderRow): Promise<string> {
  return await withXeroRetry(async (xero) => {
    const tenantId = await getTenantIdOrThrow(xero);

    // quantity
    const litresNum =
      typeof order.litres === "string" ? Number(order.litres) : order.litres ?? 1;
    const qty = Number.isFinite(litresNum) && (litresNum as number) > 0 ? (litresNum as number) : 1;

    // unit price
    const unitAmount =
      poundsFromPence(order.unit_price_pence) ??
      (order.total_pence != null ? poundsFromPence(order.total_pence)! / qty : 0);

    // optional tracking/cost centre (keep if you use it)
    const trackingCategoryId = process.env.XERO_TRACKING_CATEGORY_ID;
    const trackingOptionId =
      order.postcode ? buildCostCentreFromPostcode(order.postcode) : undefined;

    const description = `FuelFlow ${order.fuel ?? "Fuel"} order (${order.id})`;

    const payload: any = {
      Invoices: [
        {
          Type: "ACCREC",
          Status: "AUTHORISED",
          Reference: `FuelFlow Order ${order.id}`,
          Contact: {
            Name: order.name || order.user_email || "FuelFlow Customer",
            EmailAddress: order.user_email || undefined,
          },
          Date: order.paid_at || order.created_at || new Date().toISOString(),
          DueDate: order.paid_at || order.created_at || new Date().toISOString(),
          LineItems: [
            {
              Description: description,
              Quantity: qty,
              UnitAmount: unitAmount,
              AccountCode: process.env.XERO_SALES_ACCOUNT_CODE || undefined,
              TaxType: process.env.XERO_TAX_TYPE || undefined,
              ...(trackingCategoryId && trackingOptionId
                ? {
                    Tracking: [
                      {
                        TrackingCategoryID: trackingCategoryId,
                        TrackingOptionID: trackingOptionId,
                      },
                    ],
                  }
                : {}),
            },
          ],
        },
      ],
    };

    const resp = await xero.accountingApi.createInvoices(tenantId, payload);

    const invoiceId =
      resp?.body?.invoices?.[0]?.invoiceID ||
      resp?.body?.Invoices?.[0]?.InvoiceID;

    if (!invoiceId) {
      throw new Error("Xero invoice creation succeeded but no InvoiceID returned.");
    }

    return invoiceId;
  });
}
