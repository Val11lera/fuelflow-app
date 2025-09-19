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
  /**
   * Optional, but supported — this is the cause of your error if the
   * file you compile against doesn’t include it.
   */
  company?: Party;

  customer: Party;
  items: InvoiceItem[];
  currency: string;
  notes?: string;

  /**
   * Whether to email the generated invoice (handled by your mailer).
   * Not required by the PDF builder, harmless to pass through.
   */
  email?: boolean;
};

export type BuiltInvoice = {
  pdfBuffer: Buffer;
  filename: string;
  total: number;
};
