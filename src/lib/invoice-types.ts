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
  /** Seller (your business). Optional. */
  company?: Party;

  /** Buyer (your customer). */
  customer: Party;

  items: InvoiceItem[];

  /** ISO code, e.g. "GBP" */
  currency: string;

  notes?: string;

  /** If true and email + RESEND_API_KEY present, we send the PDF. */
  email?: boolean;
};

export type BuiltInvoice = {
  pdfBuffer: Buffer;
  filename: string;
  total: number;
};
