import { Fragment, type ReactNode } from "react";

/** Inline tags Europe PMC uses in titles and abstracts that are safe to keep. */
const INLINE = new Set(["i", "em", "b", "strong", "sub", "sup", "u"]);

/** A quote to highlight (EN-17); `active` draws it stronger, e.g. while its fact is hovered. */
export interface Mark {
  quote: string;
  active?: boolean;
}

/**
 * Renders source HTML (titles, abstracts) as React elements from an allowlist, never via
 * `dangerouslySetInnerHTML`. Section headings (`<h4>Methods</h4>`) become bold run-in labels
 * on their own line; unknown tags keep their text and lose the markup.
 *
 * `marks` are highlighted where they occur within one text node. A quote that crosses markup
 * (an italic species name, say) is not highlighted.
 */
export function SourceHtml({ html, marks = [] }: { html: string; marks?: Mark[] }) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  const patterns = marks.flatMap((m) => {
    const re = quotePattern(m.quote);
    return re ? [{ re, active: m.active ?? false }] : [];
  });
  return <>{root ? renderChildren(root, patterns) : html}</>;
}

type Pattern = { re: RegExp; active: boolean };

/** Matches the quote as `quoteInText` does: any case, any whitespace, dash and quote variants. */
function quotePattern(quote: string): RegExp | null {
  const words = quote.trim().replace(/\.$/, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  const esc = (w: string) =>
    w
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/[-‐-―−]/g, "[-‐-―−]")
      .replace(/['‘’‛′]/g, "['‘’‛′]")
      .replace(/["“”″]/g, '["“”″]');
  return new RegExp(words.map(esc).join("\\s+"), "gi");
}

function highlight(text: string, patterns: Pattern[]): ReactNode {
  const ranges: { start: number; end: number; active: boolean }[] = [];
  for (const { re, active } of patterns) {
    for (const m of text.matchAll(re)) {
      ranges.push({ start: m.index, end: m.index + m[0].length, active });
    }
  }
  if (ranges.length === 0) return text;
  // Active first so it wins an overlap, then left to right; overlapping ranges are dropped.
  ranges.sort((a, b) => Number(b.active) - Number(a.active) || a.start - b.start);
  const kept: typeof ranges = [];
  for (const r of ranges) {
    if (!kept.some((k) => r.start < k.end && k.start < r.end)) kept.push(r);
  }
  kept.sort((a, b) => a.start - b.start);

  const out: ReactNode[] = [];
  let at = 0;
  for (const r of kept) {
    out.push(text.slice(at, r.start));
    out.push(
      <mark
        key={r.start}
        className={
          r.active
            ? "rounded-sm bg-amber-300 text-inherit ring-2 ring-amber-400"
            : "rounded-sm bg-amber-100 text-inherit"
        }
      >
        {text.slice(r.start, r.end)}
      </mark>,
    );
    at = r.end;
  }
  out.push(text.slice(at));
  return out;
}

function renderChildren(node: Node, patterns: Pattern[]): ReactNode[] {
  return Array.from(node.childNodes).map((child, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: static markup, never reordered
    <Fragment key={i}>{renderNode(child, patterns)}</Fragment>
  ));
}

function renderNode(node: Node, patterns: Pattern[]): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return patterns.length ? highlight(text, patterns) : text;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const tag = (node as Element).tagName.toLowerCase();
  const children = renderChildren(node, patterns);
  if (INLINE.has(tag)) {
    const Tag = tag as "i";
    return <Tag>{children}</Tag>;
  }
  if (/^h[1-6]$/.test(tag)) {
    return <strong className="mt-2 block font-semibold first:mt-0">{children}</strong>;
  }
  if (tag === "p" || tag === "div") return <span className="block">{children}</span>;
  if (tag === "br") return <br />;
  return children;
}
