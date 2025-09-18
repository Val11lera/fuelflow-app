// Shared invoice types used by API, services and PDF builder

export type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoicePayload = {
  company: { name: string };
  customer: { name: string; email?: string };
  items: InvoiceItem[];
  currency: string;       // e.g. "GBP"
  email?: boolean;        // optional: ask API to email if true
  notes?: string;
};
