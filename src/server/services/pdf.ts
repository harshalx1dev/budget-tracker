import "server-only";
import { getDocumentProxy } from "unpdf";
import { pdfPagesToTable, type PdfItem } from "@/lib/pdf-statement";

/** Positioned text of every page, then the shared table builder. Throws a readable error for locked PDFs. */
export async function pdfToTable(bytes: Uint8Array): Promise<string[][]> {
  let pdf;
  try {
    pdf = await getDocumentProxy(bytes);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (/password/i.test(msg)) throw new Error("that PDF is password protected; download an unlocked copy or use the CSV");
    throw new Error("could not read that PDF");
  }
  const pages: PdfItem[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    pages.push(
      content.items
        .filter((i): i is typeof i & { str: string; transform: number[]; width: number } => "str" in i)
        .map((i) => ({ x: i.transform[4], y: i.transform[5], w: i.width, str: i.str })),
    );
  }
  const table = pdfPagesToTable(pages);
  if (!table) throw new Error("could not find a transaction table in that PDF; try the CSV download");
  return table;
}
