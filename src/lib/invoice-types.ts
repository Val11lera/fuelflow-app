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
  /** Optional – supported by the builder */
  company?: Party;
  customer: Party;
  items: InvoiceItem[];
  /** e.g. "GBP" | "USD" | "EUR" */
  currency: string;
  notes?: string;
  /** If true, the caller may choose to email the PDF */
  email?: boolean;
};

export type BuiltInvoice = {
  pdfBuffer: Buffer;
  filename: string;
  total: number;
};
