// src/lib/invoice-types.ts
// src/lib/invoice-types.ts

export type Party = {
  name: string;
  email?: string;
  address1?: string;
  address2?: string;
};

export type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoicePayload = {
  /** Seller (your company). Optional. */
  company?: Party;
  /** Buyer (your customer). */
  customer: Party;
  items: InvoiceItem[];
  /** ISO currency, e.g. "GBP" */
  currency: string;
  notes?: string;

  /** Ask API to email the PDF (requires RESEND_API_KEY). */
  email?: boolean;
};

export type BuiltInvoice = {
  pdfBuffer: Buffer;
  filename: string;
  total: number;
};
