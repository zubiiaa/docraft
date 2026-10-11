import { marked } from "marked";
import type { DocNode } from "../validation/content";

/**
 * Converts imported .txt / .md into TipTap JSON.
 *
 * Safety: we build editor nodes directly from parsed tokens. We NEVER emit or
 * render HTML. Raw HTML found in Markdown becomes plain text, so "<script>" is
 * shown as literal characters. The result is still passed through
 * sanitizeDoc() by the import route.
 */

type Tok = {
  type: string;
  raw?: string;
  text?: string;
  depth?: number;
  ordered?: boolean;
  start?: number | "";
  items?: Tok[];
  tokens?: Tok[];
};

// marked HTML-escapes some inline text; we want the literal characters back.
function unescapeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function textNode(text: string, marks: string[]): DocNode[] {
  if (!text) return [];
  const node: DocNode = { type: "text", text };
  if (marks.length) node.marks = marks.map((type) => ({ type }));
  return [node];
}

function inline(tokens: Tok[] | undefined, marks: string[] = []): DocNode[] {
  const out: DocNode[] = [];
  for (const t of tokens ?? []) {
    switch (t.type) {
      case "strong":
        out.push(...inline(t.tokens, [...new Set([...marks, "bold"])]));
        break;
      case "em":
        out.push(...inline(t.tokens, [...new Set([...marks, "italic"])]));
        break;
      case "del":
      case "link":
        out.push(...inline(t.tokens, marks));
        break;
      case "br":
        out.push({ type: "hardBreak" });
        break;
      case "codespan":
      case "escape":
      case "image":
        out.push(...textNode(unescapeEntities(t.text ?? ""), marks));
        break;
      case "text":
        if (t.tokens?.length) out.push(...inline(t.tokens, marks));
        else out.push(...textNode(unescapeEntities(t.text ?? ""), marks));
        break;
      default:
        // inline HTML and anything unknown: keep as inert plain text
        out.push(...textNode(t.raw ?? t.text ?? "", marks));
    }
  }
  return out;
}

function plainParagraph(text: string): DocNode {
  const content: DocNode[] = [];
  text.split("\n").forEach((line, i) => {
    if (i > 0) content.push({ type: "hardBreak" });
    content.push(...textNode(line, []));
  });
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

function paragraphFrom(tokens: Tok[] | undefined, fallback: string): DocNode {
  const content = inline(tokens ?? [{ type: "text", text: fallback }]);
  return content.length ? { type: "paragraph", content } : { type: "paragraph" };
}

function list(t: Tok): DocNode | null {
  const items: DocNode[] = [];
  for (const item of t.items ?? []) {
    const content: DocNode[] = [];
    for (const c of item.tokens ?? []) {
      if (c.type === "list") {
        const nested = list(c);
        if (nested) content.push(nested);
      } else if (c.type === "text" || c.type === "paragraph") {
        content.push(paragraphFrom(c.tokens, c.text ?? ""));
      } else if (c.type !== "space") {
        const raw = (c.raw ?? "").trim();
        if (raw) content.push(plainParagraph(raw));
      }
    }
    if (content.length === 0 || content[0].type !== "paragraph") {
      content.unshift({ type: "paragraph" });
    }
    items.push({ type: "listItem", content });
  }
  if (items.length === 0) return null;
  if (t.ordered) {
    const start = typeof t.start === "number" && t.start >= 1 ? t.start : 1;
    return { type: "orderedList", attrs: { start }, content: items };
  }
  return { type: "bulletList", content: items };
}

function blocks(tokens: Tok[]): DocNode[] {
  const out: DocNode[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case "space":
      case "hr":
        break;
      case "heading": {
        const content = inline(t.tokens);
        const level = Math.min(Math.max(t.depth ?? 1, 1), 3);
        out.push(content.length ? { type: "heading", attrs: { level }, content } : { type: "heading", attrs: { level } });
        break;
      }
      case "paragraph":
      case "text":
        out.push(paragraphFrom(t.tokens, t.text ?? ""));
        break;
      case "list": {
        const l = list(t);
        if (l) out.push(l);
        break;
      }
      case "blockquote":
        out.push(...blocks(t.tokens ?? []));
        break;
      case "code":
        if ((t.text ?? "").trim()) out.push(plainParagraph(t.text ?? ""));
        break;
      default: {
        // html, tables and anything else: keep the source as inert plain text
        const raw = (t.raw ?? "").trim();
        if (raw) out.push(plainParagraph(raw));
      }
    }
  }
  return out;
}

export function markdownToDoc(src: string): DocNode {
  const tokens = marked.lexer(src) as unknown as Tok[];
  const content = blocks(tokens);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

export function textToDoc(src: string): DocNode {
  const content = src
    .split(/\n{2,}/)
    .map((p) => p.replace(/^\n+|\n+$/g, ""))
    .filter((p) => p.trim().length > 0)
    .map(plainParagraph);
  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}
