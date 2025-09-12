// src/pages/api/invoices/create.ts
import type { NextApiRequest, NextApiResponse } from "next";
import PDFDocument from "pdfkit";

/** Increase default body size a bit (we keep bodyParser ON for JSON) */
export const config = {
  api: {
    bodyParser: { sizeLimit: "1mb" },
  },
};

/** Draw a very simple invoice PDF */
function buildPdf(res: NextApiResponse, payload: any) {
  const {
    invoiceNumber = "INV-000000",
    issuedAt = new Date().toISOString(),
    currency = "GBP",
    company = { name: "FuelFlow", address: "" },
    customer = { name: "", address: "" },
    lines = [],
    notes = "",
  } = payload || {};

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `inline; filename="${invoiceNumber || "invoice"}.pdf"`
  );

  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.pipe(res);

  // Header
  doc.fontSize(22).text(company.name || "FuelFlow", { align: "right" });
  if (company.address) doc.fontSize(10).text(company.address, { align: "right" });
  doc.moveDown();

  // Invoice meta
  doc.fontSize(18).text("Invoice", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(12).text(`Invoice #: ${invoiceNumber}`);
  doc.text(`Issued at: ${issuedAt}`);
  doc.text(`Currency: ${currency}`);
  doc.moveDown();

  // Bill to
  doc.fontSize(14).text("Bill To");
  doc.fontSize(12).text(customer.name || "");
  if (customer.address) doc.text(customer.address);
  doc.moveDown();

  // Lines
  doc.fontSize(14).text("Items");
  doc.moveDown(0.5);
  doc.fontSize(12);

  let total = 0;
  if (Array.isArray(lines)) {
    lines.forEach((l: any) => {
      const qty = Number(l.qty || 1);
      const unitPrice = Number(l.unitPrice || 0);
      const lineTotal = qty * unitPrice;
      total += lineTotal;

      doc.text(
        `${l.description || "Item"}  —  qty: ${qty}  unit: ${unitPrice.toFixed(
          2
        )}  line total: ${lineTotal.toFixed(2)}`
      );
    });
  }
  doc.moveDown();
  doc.fontSize(14).text(`Total: ${total.toFixed(2)} ${currency}`, {
    align: "right",
  });

  if (notes) {
    doc.moveDown().fontSize(12).text(notes);
  }

  doc.end(); // very important for finishing the stream
}

/** Build a sample payload for /api/invoices/create?preview=1 */
function samplePayload() {
  return {
    invoiceNumber: "INV-000123",
    issuedAt: "2025-09-12T12:00:00.000Z",
    currency: "GBP",
    company: { name: "FuelFlow", address: "1 Aviation Way\nLondon\nUK" },
    customer: {
      id: "cust_abc123",
      name: "Jane Pilot",
      email: "jane@example.com",
      address: "2 Runway Road\nGlasgow\nUK",
    },
    lines: [
      { description: "Fuel Uplift — A320", qty: 1, unitPrice: 450.25 },
      { description: "Ramp Service", qty: 1, unitPrice: 75.0 },
    ],
    notes: "Thank you for flying with us.",
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === "GET") {
      // Quick visual preview in the browser:
      if ("preview" in req.query) {
        const payload = samplePayload();
        return buildPdf(res, payload);
      }
      return res.status(405).json({ error: "Use POST or ?preview=1" });
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const payload = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (!payload || !payload.invoiceNumber || !Array.isArray(payload.lines)) {
      return res.status(400).json({ error: "Missing required invoice fields" });
    }

    return buildPdf(res, payload);
  } catch (err: any) {
    console.error("Invoice API error:", err);
    return res
      .status(500)
      .json({ error: "Internal Server Error", detail: err?.message });
  }
}

