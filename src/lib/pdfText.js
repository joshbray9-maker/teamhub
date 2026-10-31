// Text items (with positions) from a PDF, read in the browser with pdf.js (loaded only when needed).
// y grows downward and pages are stacked, so rows sort top-to-bottom across pages.
export async function pdfTextItems(file, maxPages = 20) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const items = []; let offset = 0;
  for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
    const page = await doc.getPage(n); const h = page.getViewport({ scale: 1 }).height;
    for (const it of (await page.getTextContent()).items) if (it.str) items.push({ str: it.str, x: it.transform[4], y: offset + (h - it.transform[5]) });
    offset += h + 50;
  }
  return items;
}
