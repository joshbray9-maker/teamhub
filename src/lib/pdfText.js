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

/** Text items per page for the Program Builder importer: { str, x0, x1, y } with y from the page top. */
export async function pdfPages(file) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n), h = page.getViewport({ scale: 1 }).height;
    pages.push({ items: (await page.getTextContent()).items.filter((it) => typeof it.str === 'string')
      .map((it) => ({ str: it.str, x0: it.transform[4], x1: it.transform[4] + it.width, y: h - it.transform[5] })) });
  }
  return pages;
}
