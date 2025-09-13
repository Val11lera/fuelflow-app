// src/types/invoice.ts
export type Party = {
  name: string;
  address?: string;
  email?: string;
  id?: string;
};

export type Line = {
  description: string;
  qty: number;
  unitPrice: number;
};

export type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string; // ISO string
  currency: string; // e.g. "GBP"
  company: Party;
  customer: Party;
  lines: Line[];
  notes?: string;
  email?: boolean; // if true, email the invoice to customer.email
};
