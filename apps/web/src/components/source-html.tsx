import { Fragment, type ReactNode } from "react";

/** Inline tags Europe PMC uses in titles and abstracts that are safe to keep. */
const INLINE = new Set(["i", "em", "b", "strong", "sub", "sup", "u"]);

/**
 * Renders source HTML (titles, abstracts) as React elements from an allowlist, never via
 * `dangerouslySetInnerHTML`. Section headings (`<h4>Methods</h4>`) become bold run-in labels
 * on their own line; unknown tags keep their text and lose the markup.
 */
export function SourceHtml({ html }: { html: string }) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const root = doc.body.firstElementChild;
  return <>{root ? renderChildren(root) : html}</>;
}

function renderChildren(node: Node): ReactNode[] {
  return Array.from(node.childNodes).map((child, i) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: static markup, never reordered
    <Fragment key={i}>{renderNode(child)}</Fragment>
  ));
}

function renderNode(node: Node): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const tag = (node as Element).tagName.toLowerCase();
  const children = renderChildren(node);
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
