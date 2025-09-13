// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
// Minimal, working PDF endpoint for POST and a quick GET probe
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";

// allow JSON body up to 1 MB
export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

type Party = { name: string; address?: string; email?: string };
type Line  = { description: string; qty: number; unitPrice: number };
type InvoicePayload = {
  invoiceNumber: string;
  issuedAt: string;
  currency: string;
  company: Party;
  customer: Party & { id?: string };
  lines: Line[];
  notes?: string;
  email?: boolean;
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    // sanity check so hitting the URL in a browser returns something
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const body = req.body as InvoicePayload;

  // --- Build a very simple PDF (enough to prove it works) ---
  const doc = new PDFDocument({ size: "A4", margin: 40 });

  res.setHeader("Content-Type", "application/pdf");
  // use inline so it opens in browser; curl will still save it to a file
  res.setHeader("Content-Disposition", 'inline; filename="invoice.pdf"');

  doc.pipe(res);

  doc.fontSize(18).text("FuelFlow Invoice", { align: "center" }).moveDown();
  doc.fontSize(12);
  doc.text(`Invoice: ${body?.invoiceNumber ?? "N/A"}`);
  doc.text(`Issued:  ${body?.issuedAt ?? "N/A"}`);
  doc.moveDown();

  doc.text(`Bill To: ${body?.customer?.name ?? ""}`);
  if (body?.customer?.address) doc.text(body.customer.address);
  if (body?.customer?.email)   doc.text(body.customer.email);
  doc.moveDown();

  let total = 0;
  doc.text("Items:").moveDown(0.5);
  (body?.lines ?? []).forEach((l, i) => {
    const lineTotal = (l.qty ?? 0) * (l.unitPrice ?? 0);
    total += lineTotal;
    doc.text(
      `${i + 1}. ${l.description} — qty ${l.qty} × ${l.unitPrice.toFixed(2)} = ${lineTotal.toFixed(2)}`
    );
  });
  doc.moveDown();
  doc.text(`Total: ${total.toFixed(2)} ${body?.currency ?? ""}`, { align: "right" });

  if (body?.notes) {
    doc.moveDown();
    doc.text(`Notes: ${body.notes}`);
  }

  doc.end(); // IMPORTANT: finishes the PDF stream
}
