// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Quick sanity check in the browser:
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, route: "/api/invoices/create" });
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).end("Method Not Allowed");
  }

  try {
    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    // --- Minimal PDF so Preview can open it ---
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "inline; filename=invoice.pdf");

    const doc = new PDFDocument({ size: "A4", margin: 50 });
    doc.pipe(res);

    doc.fontSize(20).text("Invoice", { align: "center" });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Invoice #: ${payload?.invoiceNumber ?? "-"}`);
    doc.text(`Issued At: ${payload?.issuedAt ?? "-"}`);
    doc.text(`Currency: ${payload?.currency ?? "-"}`);
    doc.moveDown();

    doc.text(`Company: ${payload?.company?.name ?? "-"}`);
    doc.text(payload?.company?.address ?? "");
    doc.moveDown();

    doc.text(`Bill To: ${payload?.customer?.name ?? "-"}`);
    doc.text(payload?.customer?.address ?? "");
    doc.moveDown();

    const lines: Array<any> = payload?.lines ?? [];
    doc.text("Lines:");
    lines.forEach((l: any, i: number) => {
      doc.text(
        `${i + 1}. ${l.description} — qty: ${l.qty ?? 1} @ ${l.unitPrice ?? 0}`
      );
    });

    if (payload?.notes) {
      doc.moveDown();
      doc.text(`Notes: ${payload.notes}`);
    }

    doc.end(); // <- very important (flushes PDF)
    // Do NOT res.json() after piping the PDF.
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: "Failed to create PDF" });
  }
}

