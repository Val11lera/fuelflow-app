declare module "pdfkit" {
  class PDFDocument {
    constructor(options?: any);
    pipe(dest: NodeJS.WritableStream): NodeJS.WritableStream;
    fontSize(size: number): this;
    text(text: string, x?: number, y?: number, options?: any): this;
    moveDown(lines?: number): this;
    end(): void;
  }
  export default PDFDocument;
}
