// src/lib/invoices-storage.ts
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function saveInvoicePdfToStorage(args: {
  email: string;
  invoiceNumber: string;
  pdfBuffer: Buffer | Uint8Array;
  issuedAt?: Date;
}) {
  const emailLower = (args.email || "").toLowerCase().trim();
  if (!emailLower) throw new Error("Missing customer email for storage path.");
  if (!args.invoiceNumber) throw new Error("Missing invoice number for storage path.");

  const issued = args.issuedAt ?? new Date();
  const yyyy = String(issued.getFullYear());
  const mm = String(issued.getMonth() + 1).padStart(2, "0");

  const objectPath = `${emailLower}/${yyyy}/${mm}/${args.invoiceNumber}.pdf`;

  const { error } = await supabaseAdmin.storage
    .from("invoices")
    .upload(objectPath, args.pdfBuffer, {
      contentType: "application/pdf",
      upsert: true, // re-issue allowed
    });

  if (error) throw error;
  return { bucket: "invoices", path: objectPath, year: yyyy, month: mm };
}
