// Shared invoice types used by API, services and PDF builder
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
  /** Seller; optional, used in header if present */
  company?: Party;
  /** Buyer (your customer) */
  customer: Party;
  items: InvoiceItem[];
  /** ISO currency code, e.g. "GBP" */
  currency: string;
  notes?: string;

  /**
   * If true, the API will attempt to email the PDF to customer.email
   * (requires RESEND_API_KEY and a valid MAIL_FROM or default).
   */
  email?: boolean;
};

export type BuiltInvoice = {
  pdfBuffer: Buffer;
  filename: string;
  total: number;
};
