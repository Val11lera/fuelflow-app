// Minimal PDF builder that avoids typing 'PDFDocument' as a type.
import PDFDocument from 'pdfkit';

export type InvoicePayload = {
  company: { name: string; address: string };
  customer: { name: string; address: string; email?: string };
  lines: Array<{ description: string; qty: number; unitPrice: number }>;
  notes?: string;
  email?: boolean;
};

export async function buildInvoicePdf(p: InvoicePayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc: any = new (PDFDocument as any)({ size: 'A4', margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // Header
    doc.fontSize(22).text('INVOICE', { align: 'right' }).moveDown();

    // From/To
    doc.fontSize(12).text(p.company.name).text(p.company.address).moveDown();
    doc.fontSize(12).text('Bill To:').moveDown(0.2);
    doc.text(p.customer.name).text(p.customer.address).moveDown();

    // Table-ish
    doc.text('Description                             Qty     Unit      Amount');
    doc.moveDown(0.2);

    let total = 0;
    for (const l of p.lines) {
      const amount = l.qty * l.unitPrice;
      total += amount;
      doc.text(
        `${l.description.padEnd(40).slice(0,40)} ${String(l.qty).padStart(3)}  ${l.unitPrice.toFixed(2).padStart(8)}  ${amount.toFixed(2).padStart(10)}`
      );
    }

    doc.moveDown().fontSize(14).text(`Total: ${total.toFixed(2)}`, { align: 'right' });

    if (p.notes) {
      doc.moveDown().fontSize(12).text('Notes:').moveDown(0.2).text(p.notes);
    }

    doc.end();
  });
}
