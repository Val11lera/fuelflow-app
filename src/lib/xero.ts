// src/lib/xero.ts
// src/lib/xero.ts
import { XeroClient, TokenSet } from "xero-node";
import { createClient } from "@supabase/supabase-js";
import { buildCostCentreFromPostcode } from "./cost-centre"; // keep - used elsewhere in your app

// -----------------------------------------------------------------------------
// Supabase (admin) client (SERVICE ROLE)
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
// Token store helpers
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
  const expiresAt = tokenSet?.expires_at; // unix seconds
  if (!expiresAt) return false;

  const now = Math.floor(Date.now() / 1000);
  return now >= Number(expiresAt) - 60; // refresh early (60s buffer)
}

// -----------------------------------------------------------------------------
// Public: get Xero client (auto-refresh if expired + persist rotated tokens)
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

  if (isExpired(tokenSet)) {
    const newTokenSet = await xero.refreshToken();
    xero.setTokenSet(newTokenSet);
    await saveTokenSet(newTokenSet);
  }

  return xero;
}

// -----------------------------------------------------------------------------
// Public: retry wrapper (refresh & retry once on invalid/expired token)
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
// Backwards compatible types/exports for existing routes (sync-pending.ts)
// -----------------------------------------------------------------------------
export type OrderRow = {
  [key: string]: any;

  id: string;

  user_email?: string | null;
  name?: string | null;

  fuel?: string | null;
  litres?: string | number | null;

  total_pence?: number | null;
  unit_price_pence?: number | null;

  created_at?: string | null;
  paid_at?: string | null;

  postcode?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;

  delivery_date?: string | null;

  cost_centre?: string | null;
  subjective_code?: string | null;
};

function poundsFromPence(pence?: number | null) {
  if (pence == null) return undefined;
  return Math.round(pence) / 100;
}

function isoDateOnly(d?: string | null) {
  // Xero likes YYYY-MM-DD
  if (!d) return new Date().toISOString().slice(0, 10);
  // if it's already YYYY-MM-DD, keep it
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return new Date().toISOString().slice(0, 10);
  return dt.toISOString().slice(0, 10);
}

async function getTenantIdOrThrow(xero: any): Promise<string> {
  const envTenantId = process.env.XERO_TENANT_ID;
  if (envTenantId) return envTenantId;

  const tenants = await xero.updateTenants();
  const tenantId = tenants?.[0]?.tenantId;
  if (!tenantId) throw new Error("No Xero tenant connected. Reconnect Xero and try again.");
  return tenantId;
}

// -----------------------------------------------------------------------------
// Back-compat: create invoice for order
// MUST return { xeroInvoiceId, xeroInvoiceNumber }
// -----------------------------------------------------------------------------
export async function createXeroInvoiceForOrder(
  order: OrderRow
): Promise<{ xeroInvoiceId: string; xeroInvoiceNumber?: string }> {
  return await withXeroRetry(async (xero) => {
    const tenantId = await getTenantIdOrThrow(xero);

    const litresRaw = order.litres ?? order.Litres ?? 1;
    const litresNum = typeof litresRaw === "string" ? Number(litresRaw) : Number(litresRaw);
    const qty = Number.isFinite(litresNum) && litresNum > 0 ? litresNum : 1;

    const unitPricePence = order.unit_price_pence ?? order.unitPricePence ?? null;
    const totalPence = order.total_pence ?? order.totalPence ?? null;

    const unitAmount =
      poundsFromPence(unitPricePence) ??
      (totalPence != null ? poundsFromPence(totalPence)! / qty : 0);

    const fuel = order.fuel ?? order.Fuel ?? "Fuel";
    const description = `FuelFlow ${fuel} order (${order.id})`;

    // REQUIRED (in most orgs): at least an AccountCode (revenue) and a valid TaxType
    const accountCode = process.env.XERO_SALES_ACCOUNT_CODE || process.env.XERO_ACCOUNT_CODE || "200";
    const taxType = process.env.XERO_TAX_TYPE; // MUST be a valid Xero tax type code for your org

    if (!taxType) {
      // Don’t silently create broken invoices
      throw new Error(
        "Missing XERO_TAX_TYPE. Set it in Vercel to a VALID Xero tax type code (e.g. OUTPUT2 / NONE / etc, depending on your org)."
      );
    }

    // Tracking (optional)
    const trackingCategoryId = process.env.XERO_TRACKING_CATEGORY_ID;

    // Prefer explicit cost_centre, fallback to postcode mapping if present
    const trackingOptionId =
      (order.cost_centre as string | undefined) ||
      (order.postcode ? buildCostCentreFromPostcode(order.postcode) : undefined);

    // ✅ IMPORTANT: xero-node expects camelCase keys (invoices, lineItems, unitAmount, accountCode, taxType, contact)
    const payload: any = {
      invoices: [
        {
          type: "ACCREC",
          status: "AUTHORISED",
          reference: `FuelFlow Order ${order.id}`,

          contact: {
            name: order.name || order.user_email || "FuelFlow Customer",
            emailAddress: order.user_email || undefined,
          },

          date: isoDateOnly(order.paid_at || order.created_at),
          dueDate: isoDateOnly(order.paid_at || order.created_at),

          lineAmountTypes: "Exclusive",

          lineItems: [
            {
              description,
              quantity: qty,
              unitAmount,
              accountCode,
              taxType,

              ...(trackingCategoryId && trackingOptionId
                ? {
                    tracking: [
                      {
                        trackingCategoryID: trackingCategoryId,
                        trackingOptionID: trackingOptionId,
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

    const body: any = resp?.body;

    // OpenAPI generator uses lowerCamelCase `invoices`
    const invoice = body?.invoices?.[0] || body?.Invoices?.[0];

    const invoiceId: string | undefined = invoice?.invoiceID || invoice?.InvoiceID;
    const invoiceNumber: string | undefined = invoice?.invoiceNumber || invoice?.InvoiceNumber;

    if (!invoiceId) {
      throw new Error("Xero invoice creation returned no invoiceID. Check Xero response body.");
    }

    return { xeroInvoiceId: invoiceId, xeroInvoiceNumber: invoiceNumber };
  });
}
