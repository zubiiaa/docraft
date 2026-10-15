type Mark = { type?: string };

type Node = {
  type?: string;
  text?: string;
  marks?: Mark[];
  attrs?: { level?: number; start?: number };
  content?: Node[];
};

type MarkName = "bold" | "italic" | "underline";
type Run = { text: string; marks: Set<string> } | "break";

const MARK_ORDER: MarkName[] = ["bold", "italic", "underline"];
const DELIMITERS: Record<MarkName, [string, string]> = {
  bold: ["**", "**"],
  italic: ["*", "*"],
  underline: ["<u>", "</u>"],
};

function children(node: unknown): Node[] {
  if (!node || typeof node !== "object") return [];
  const content = (node as Node).content;
  return Array.isArray(content) ? content.filter((child) => child && typeof child === "object") : [];
}

function escapeInline(text: string): string {
  return text.replace(/[\\`*_[\]<>~]/g, "\\$&");
}

function escapeLineStart(line: string): string {
  return line
    .replace(/^(\s*)([#>+-])/, "$1\\$2")
    .replace(/^(\s*)(\d+)([.)])/, "$1$2\\$3");
}

function renderRuns(runs: Run[], order: MarkName[]): string {
  if (order.length === 0) {
    return runs.map((run) => (run === "break" ? "\\\n" : escapeInline(run.text))).join("");
  }
  const [mark, ...rest] = order;
  const groups: { marked: boolean; runs: Run[] }[] = [];
  for (const run of runs) {
    const marked = run !== "break" && run.marks.has(mark);
    const last = groups[groups.length - 1];
    if (last && last.marked === marked) last.runs.push(run);
    else groups.push({ marked, runs: [run] });
  }
  return groups
    .map((group) => {
      const inner = renderRuns(group.runs, rest);
      if (!group.marked) return inner;
      const [, lead = "", core = "", trail = ""] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner) ?? [];
      if (!core) return inner;
      const [open, close] = DELIMITERS[mark];
      return `${lead}${open}${core}${close}${trail}`;
    })
    .join("");
}

function inlineMarkdown(nodes: Node[]): string {
  const runs: Run[] = [];
  for (const node of nodes) {
    if (node.type === "hardBreak") runs.push("break");
    else if (node.type === "text" && node.text) {
      runs.push({ text: node.text, marks: new Set((node.marks ?? []).map((mark) => mark.type ?? "")) });
    }
  }
  while (runs[0] === "break") runs.shift();
  while (runs[runs.length - 1] === "break") runs.pop();
  return renderRuns(runs, MARK_ORDER).split("\n").map(escapeLineStart).join("\n").trim();
}

function indent(text: string, width: number): string {
  const pad = " ".repeat(width);
  return text
    .split("\n")
    .map((line) => (line ? pad + line : line))
    .join("\n");
}

function listMarkdown(list: Node): string {
  const ordered = list.type === "orderedList";
  const start = Math.max(1, Number(list.attrs?.start ?? 1) || 1);
  return children(list)
    .map((item, index) => {
      const marker = ordered ? `${start + index}.` : "-";
      const width = marker.length + 1;
      const body = children(item)
        .map((child) => ({ paragraph: child.type === "paragraph", text: blockMarkdown(child) }))
        .filter((block) => block.text);
      if (body.length === 0) return marker;
      return body
        .map((block, i) => {
          if (i === 0) return `${marker} ${indent(block.text, width).slice(width)}`;
          return `${block.paragraph ? "\n" : ""}${indent(block.text, width)}`;
        })
        .join("\n");
    })
    .join("\n");
}

function blockMarkdown(node: Node): string {
  switch (node.type) {
    case "heading": {
      const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
      const text = inlineMarkdown(children(node))
        .replace(/\\\n/g, " ")
        .replace(/(\s)(#+)$/, (_, space: string, hashes: string) => `${space}${hashes.replace(/#/g, "\\#")}`);
      return text ? `${"#".repeat(level)} ${text}` : "";
    }
    case "paragraph":
      return inlineMarkdown(children(node));
    case "bulletList":
    case "orderedList":
      return listMarkdown(node);
    default:
      return "";
  }
}

export function docToMarkdown(title: string, doc: unknown): string {
  const body = children(doc)
    .map(blockMarkdown)
    .filter(Boolean)
    .join("\n\n");
  const heading = title.trim() ? `# ${escapeInline(title.trim())}` : "";
  return [heading, body].filter(Boolean).join("\n\n") + "\n";
}
