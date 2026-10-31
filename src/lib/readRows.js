// Reads a chosen CSV or PDF file into rows of cells (rows[0] = headings), in the browser.
// For PDFs, `isHeading` says which cells look like column headings, so the heading row can be
// found and the text below placed under the right column.
import { parseCsv, pdfItemsToTable } from './rosterImport.js';
import { pdfTextItems } from './pdfText.js';

export const isPdf = (file) => /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
export async function readRows(file, isHeading) {
  if (isPdf(file)) {
    const rows = pdfItemsToTable(await pdfTextItems(file), isHeading);
    if (!rows) throw new Error('No table found in the PDF. It needs selectable text (not a scanned image) with a row of column headings.');
    return rows;
  }
  return parseCsv(await file.text());
}
