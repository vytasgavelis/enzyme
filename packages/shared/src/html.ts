const BLOCK_TAG = /<\/?(?:h[1-6]|p|br|div|li|ul|ol|table|tr|td|th|section)\b[^>]*>/gi;
const ANY_TAG = /<\/?[a-z][^>]*>/gi;
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/**
 * Turns source HTML (titles, abstracts) into plain text for search indexing and model
 * input. Not a sanitiser: never render its output as HTML.
 *
 * Block tags become spaces so section headings don't glue onto the next word; inline
 * tags vanish so `CO<sub>2</sub>` stays `CO2`.
 */
export function stripHtml(html: string): string {
  return html
    .replace(BLOCK_TAG, " ")
    .replace(ANY_TAG, "")
    .replace(/&(?:#(\d+)|#x([0-9a-f]+)|([a-z]+));/gi, (match, dec, hex, name) => {
      if (dec) return String.fromCodePoint(Number(dec));
      if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
      return NAMED_ENTITIES[name.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, " ")
    .trim();
}
