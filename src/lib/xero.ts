// src/lib/xero.ts
import { XeroClient, TokenSet } from "xero-node";

function getTokenSetFromEnv(): TokenSet {
  const raw = process.env.XERO_TOKEN_SET;
  if (!raw) throw new Error("XERO_TOKEN_SET env var missing");
  return JSON.parse(raw);
}

export function getXeroClient() {
  if (!process.env.XERO_CLIENT_ID || !process.env.XERO_CLIENT_SECRET) {
    throw new Error("Xero env vars missing");
  }

  const xero = new XeroClient({
    clientId: process.env.XERO_CLIENT_ID!,
    clientSecret: process.env.XERO_CLIENT_SECRET!,
    redirectUris: [process.env.XERO_REDIRECT_URI!],
    scopes: (process.env.XERO_SCOPES || "").split(" "),
  });

  const tokenSet = getTokenSetFromEnv();
  xero.setTokenSet(tokenSet);

  return xero;
}

export interface OrderRow {
  id: string;
  name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  fuel: "petrol" | "diesel" | null;
  litres: number | string | null;
  unit_price_pence: number | null;
  delivery_date: string | null;
  cost_centre: string | null;
  subjective_code: string | null;
}

export async function createXeroInvoiceForOrder(order: OrderRow) {
  const xero = getXeroClient();
  const tenantId = process.env.XERO_TENANT_ID;
  if (!tenantId) throw new Error("XERO_TENANT_ID missing");

  const invoiceDate =
    order.delivery_date ?? new Date().toISOString().slice(0, 10);
  const quantity = Number(order.litres || 0);
  const unitAmount = (order.unit_price_pence ?? 0) / 100;

  const description = `${order.fuel || "Fuel"} delivery to ${
    order.postcode || ""
  }`.trim();

  const tracking: any[] = [];
  if (order.cost_centre) {
    tracking.push({ name: "Cost Centre", option: order.cost_centre });
  }
  if (order.subjective_code) {
    tracking.push({ name: "Subjective Code", option: order.subjective_code });
  }

  const invoice = {
    type: "ACCREC" as const,
    contact: {
      name: order.name || "FuelFlow Customer",
      addresses: [
        {
          addressType: "STREET",
          addressLine1: order.address_line1 || undefined,
          addressLine2: order.address_line2 || undefined,
          city: order.city || undefined,
          postalCode: order.postcode || undefined,
          country: "United Kingdom",
        },
      ],
    },
    date: invoiceDate,
    dueDate: invoiceDate,
    lineAmountTypes: "NoTax", // adjust later if you add VAT
    reference: `FuelFlow order ${order.id}`,
    lineItems: [
      {
        description,
        quantity,
        unitAmount,
        accountCode: "200", // your Sales account in Xero
        taxType: "NONE",
        tracking,
      },
    ],
  };

// Build payload for Xero – cast to any so TypeScript stops complaining
const payload: any = { invoices: [invoice as any] };

const result = await (xero.accountingApi as any).createInvoices(tenantId, payload);
const created = (result.body as any).invoices?.[0];


  if (!created) {
    throw new Error("Xero createInvoices returned no invoices");
  }

  // You can log this once to update XERO_TOKEN_SET occasionally:
  // console.log("Updated TOKEN_SET:", JSON.stringify(xero.readTokenSet()));

  return {
    xeroInvoiceId: created.invoiceID,
    xeroInvoiceNumber: created.invoiceNumber,
  };
}
