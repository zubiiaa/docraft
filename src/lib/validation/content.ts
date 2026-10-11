/**
 * Server-side allowlist for TipTap/ProseMirror JSON.
 *
 * We never trust client-supplied document JSON. `sanitizeDoc` rebuilds the
 * tree from scratch, copying only node types, marks and attributes we
 * support, and throws ContentError on anything else. Text is stored as plain
 * strings and rendered by TipTap as text (never as HTML), so imported or
 * pasted content cannot inject markup.
 */
export type DocNode = {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: { type: string }[];
  content?: DocNode[];
};

export const EMPTY_DOC: DocNode = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export class ContentError extends Error {}

const CHILDREN: Record<string, readonly string[]> = {
  doc: ["paragraph", "heading", "bulletList", "orderedList"],
  paragraph: ["text", "hardBreak"],
  heading: ["text", "hardBreak"],
  bulletList: ["listItem"],
  orderedList: ["listItem"],
  listItem: ["paragraph", "bulletList", "orderedList"],
  text: [],
  hardBreak: [],
};

const MARKS = new Set(["bold", "italic", "underline"]);
const MAX_BYTES = 1_000_000;
const MAX_DEPTH = 12;
const MAX_NODES = 50_000;

export function sanitizeDoc(input: unknown): DocNode {
  const raw = JSON.stringify(input);
  if (!raw || raw.length > MAX_BYTES) {
    throw new ContentError("Document content is missing or too large");
  }

  let count = 0;

  const walk = (n: unknown, depth: number, allowed: readonly string[]): DocNode => {
    if (!n || typeof n !== "object" || Array.isArray(n)) {
      throw new ContentError("Invalid document node");
    }
    if (++count > MAX_NODES || depth > MAX_DEPTH) {
      throw new ContentError("Document is too large or too deeply nested");
    }

    const node = n as Record<string, unknown>;
    const type = node.type;
    if (typeof type !== "string" || !allowed.includes(type)) {
      throw new ContentError("Document contains an unsupported element");
    }

    const out: DocNode = { type };
    const attrs = (node.attrs ?? {}) as Record<string, unknown>;

    if (type === "text") {
      if (typeof node.text !== "string" || node.text.length === 0) {
        throw new ContentError("Invalid text node");
      }
      out.text = node.text;
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks)) throw new ContentError("Invalid marks");
        const marks: { type: string }[] = [];
        for (const m of node.marks) {
          const mt = (m as { type?: unknown } | null)?.type;
          if (typeof mt !== "string" || !MARKS.has(mt)) {
            throw new ContentError("Document contains unsupported formatting");
          }
          if (!marks.some((x) => x.type === mt)) marks.push({ type: mt });
        }
        if (marks.length) out.marks = marks;
      }
      return out;
    }

    if (type === "heading") {
      const level = attrs.level;
      if (typeof level !== "number" || ![1, 2, 3].includes(level)) {
        throw new ContentError("Invalid heading level");
      }
      out.attrs = { level };
    }

    if (type === "orderedList") {
      const start = attrs.start;
      out.attrs = {
        start:
          typeof start === "number" && Number.isInteger(start) && start >= 1 && start <= 1_000_000
            ? start
            : 1,
      };
    }

    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) throw new ContentError("Invalid content");
      const kids = CHILDREN[type];
      out.content = node.content.map((c) => walk(c, depth + 1, kids));
    }

    if (type === "doc" && !out.content?.length) {
      out.content = [{ type: "paragraph" }];
    }
    return out;
  };

  return walk(input, 0, ["doc"]);
}
