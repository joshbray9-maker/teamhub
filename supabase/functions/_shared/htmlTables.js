// Reads the HTML tables on a page as plain text rows (heading row first). Works with any DOM
// (deno-dom in the edge function, linkedom in tests). Used by roster-import: the browser then
// picks the table whose headings look like a roster and shows it for review.

const cellText = (el) => (el.textContent || '').replace(/\s+/g, ' ').trim();

/** Up to `max` tables with at least `minRows` body rows: [[heading cells], [cells], ...] */
export function tablesFromDoc(doc, { max = 10, minRows = 2 } = {}) {
  const out = [];
  for (const table of doc.querySelectorAll('table')) {
    const rows = [];
    for (const tr of table.querySelectorAll('tr')) {
      // hidden mobile duplicates and screen-reader labels inside a cell are joined into the text;
      // the browser-side cleaner trims them per field
      const cells = [...tr.querySelectorAll('th, td')].map(cellText);
      if (cells.some(Boolean)) rows.push(cells);
    }
    if (rows.length > minRows) out.push(rows.slice(0, 200).map((r) => r.slice(0, 20)));
    if (out.length >= max) break;
  }
  return out;
}
