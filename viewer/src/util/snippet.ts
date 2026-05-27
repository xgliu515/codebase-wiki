/**
 * SQLite FTS5 snippet() returns text with `<mark>` / `</mark>` tags inserted.
 * Render safely: allow ONLY <mark>...</mark>, treat everything else as text
 * (browser-escaped automatically via textContent). Returns DOM Nodes ready
 * for appendChild.
 *
 * This is defense-in-depth — addenda are server-side HTML-escaped before FTS
 * insert, but we never trust FTS output to be HTML-safe at render time.
 */
export function renderSnippet(snippet: string): Node[] {
  const out: Node[] = [];
  const parts = snippet.split(/(<mark>|<\/mark>)/);
  let inMark = false;
  for (const p of parts) {
    if (p === '<mark>') { inMark = true; continue; }
    if (p === '</mark>') { inMark = false; continue; }
    if (inMark) {
      const m = document.createElement('mark');
      m.textContent = p;
      out.push(m);
    } else {
      out.push(document.createTextNode(p));
    }
  }
  return out;
}
