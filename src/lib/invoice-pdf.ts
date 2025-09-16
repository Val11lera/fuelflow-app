// src/lib/invoice-pdf.ts
// src/lib/invoice-pdf.ts
import PDFDocument from "pdfkit";

// The builder is intentionally liberal about input to avoid runtime crashes.
// It accepts payload.items OR payload.lineItems. It validates at runtime.
type AnyItem = {
  description?: string;
  quantity?: number;
  unitPrice?: number;
};

function money(n: number, currency = "GBP") {
  const sign = currency === "GBP" ? "£" : currency + " ";
  return `${sign}${n.toFixed(2)}`;
}

function pickItems(payload: any): AnyItem[] {
  const raw =
    (Array.isArray(payload?.items) && payload.items) ||
    (Array.isArray(payload?.lineItems) && payload.lineItems) ||
    [];
  return raw.filter(Boolean);
}

export function buildInvoicePdf(payload: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const items = pickItems(payload);
      if (!Array.isArray(items) || items.length === 0) {
        return reject(new Error("No items array found on payload"));
      }

      const company = payload?.company ?? {};
      const customer = payload?.customer ?? {};
      const currency = payload?.currency ?? "GBP";
      const invoiceNo =
        payload?.invoiceNumber ?? `INV-${new Date().getTime()}`;
      const issue =
        payload?.issueDate ?? new Date().toISOString().slice(0, 10);

      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const buffers: Buffer[] = [];
      doc.on("data", (d) => buffers.push(d as Buffer));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      // Header (seller)
      doc.fontSize(20).text(company?.name ?? "FuelFlow", { align: "left" });
      doc.moveDown(0.5);

      // Invoice meta
      doc.fontSize(18).text("INVOICE", { align: "right" });
      doc.fontSize(10).text(`Invoice #: ${invoiceNo}`, { align: "right" });
      doc.text(`Issue date: ${issue}`, { align: "right" });

      // Customer
      doc.moveDown();
      doc.fontSize(12).text("Bill To:");
      doc.fontSize(10).text(customer?.name ?? "Customer");

      // Table header
      doc.moveDown();
      doc.fontSize(12).text("Description", 50, doc.y, { continued: true });
      doc.text("Qty", 350, undefined, { continued: true });
      doc.text("Unit", 400, undefined, { continued: true });
      doc.text("Total", 470);
      doc.moveTo(50, doc.y + 3).lineTo(550, doc.y + 3).stroke();

      // Rows
      let subtotal = 0;
      for (const it of items) {
        const qty = Number(it?.quantity ?? 0);
        const unit = Number(it?.unitPrice ?? 0);
        const desc = String(it?.description ?? "").trim() || "Item";
        const line = qty * unit;
        subtotal += line;

        doc
          .fontSize(10)
          .text(desc, 50, doc.y + 6, { continued: true });
        doc.text(String(qty), 350, undefined, { continued: true });
        doc.text(money(unit, currency), 400, undefined, { continued: true });
        doc.text(money(line, currency), 470);
      }

      // Totals
      doc.moveDown();
      doc.fontSize(12).text(`Subtotal: ${money(subtotal, currency)}`, {
        align: "right",
      });
      const total = subtotal; // extend with tax/VAT if needed
      doc.fontSize(14).text(`Total: ${money(total, currency)}`, {
        align: "right",
      });

      if (payload?.notes) {
        doc.moveDown();
        doc.fontSize(10).text(String(payload.notes));
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
