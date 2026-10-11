export type PdfNode = {
  type?: string;
  text?: string;
  content?: PdfNode[];
  attrs?: { level?: number; start?: number };
  marks?: { type?: string }[];
};

type PdfLine = {
  text: string;
  size: number;
  font: "normal" | "bold" | "italic";
  indent: number;
};

function hasMark(node: PdfNode | undefined, type: string): boolean {
  return (node?.marks ?? []).some((mark) => mark.type === type);
}

function extractText(node: unknown): string {
  if (Array.isArray(node)) return node.map((child) => extractText(child)).join("");
  if (!node || typeof node !== "object") return "";
  const current = node as PdfNode;
  if (typeof current.text === "string") return current.text;
  return (current.content ?? []).map((child) => extractText(child)).join("");
}

function flattenInline(node: unknown): string {
  if (Array.isArray(node)) return node.map((child) => flattenInline(child)).join("");
  if (!node || typeof node !== "object") return "";
  const current = node as PdfNode;
  if (current.type === "text") return current.text ?? "";
  if (current.type === "hardBreak") return "\n";
  return (current.content ?? []).map((child) => flattenInline(child)).join("");
}

function lineFontForContent(content: PdfNode[] = []): PdfLine["font"] {
  if (content.some((node) => hasMark(node, "bold"))) return "bold";
  if (content.some((node) => hasMark(node, "italic"))) return "italic";
  return "normal";
}

function collectPdfLines(doc: unknown): PdfLine[] {
  const root = doc as PdfNode | null;
  if (!root || typeof root !== "object") return [];

  const lines: PdfLine[] = [];

  const addLine = (text: string, size: number, font: PdfLine["font"], indent = 0) => {
    const trimmed = text.replace(/\s+$/u, "");
    if (!trimmed) return;
    lines.push({ text: trimmed, size, font, indent });
  };

  const walkBlock = (nodes: PdfNode[] = [], kind?: "bullet" | "ordered", level = 0, start = 1) => {
    nodes.forEach((node, index) => {
      if (!node || typeof node !== "object") return;

      switch (node.type) {
        case "heading": {
          const levelValue = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6);
          const text = flattenInline(node.content ?? []).replace(/\n+/g, " ").trim();
          if (text) addLine(text, 18 - (levelValue - 1) * 2, "bold", 0);
          return;
        }
        case "paragraph": {
          const text = flattenInline(node.content ?? []).replace(/\n+/g, " ").trim();
          if (!text) return;
          addLine(text, 12, lineFontForContent(node.content ?? []), level * 18);
          return;
        }
        case "bulletList": {
          walkBlock(node.content ?? [], "bullet", level + 1, 1);
          return;
        }
        case "orderedList": {
          walkBlock(node.content ?? [], "ordered", level + 1, Number(node.attrs?.start ?? 1));
          return;
        }
        case "listItem": {
          const text = flattenInline(node.content ?? []).replace(/\n+/g, " ").trim();
          if (!text) return;
          const prefix = kind === "ordered" ? `${start + index}.` : "•";
          addLine(`${prefix} ${text}`, 12, lineFontForContent(node.content ?? []), level * 18);
          return;
        }
        default: {
          if (Array.isArray(node.content)) walkBlock(node.content, kind, level, start);
        }
      }
    });
  };

  walkBlock(root.content ?? []);

  if (lines.length === 0 && typeof root.text === "string" && root.text.trim()) {
    addLine(root.text.trim(), 12, "normal");
  }

  return lines;
}

export function escapePdfText(value: string): string {
  const winAnsi: Record<string, number> = {
    "€": 0x80,
    "‚": 0x82,
    "ƒ": 0x83,
    "„": 0x84,
    "…": 0x85,
    "†": 0x86,
    "‡": 0x87,
    "ˆ": 0x88,
    "‰": 0x89,
    "Š": 0x8a,
    "‹": 0x8b,
    "Œ": 0x8c,
    "Ž": 0x8e,
    "‘": 0x91,
    "’": 0x92,
    "“": 0x93,
    "”": 0x94,
    "•": 0x95,
    "–": 0x96,
    "—": 0x97,
    "˜": 0x98,
    "™": 0x99,
    "š": 0x9a,
    "›": 0x9b,
    "œ": 0x9c,
    "ž": 0x9e,
    "Ÿ": 0x9f,
  };

  return Array.from(value, (character) => {
    const code = winAnsi[character] ?? character.charCodeAt(0);
    if (character === "\r" || character === "\n" || character === "\t") return " ";
    if (code > 255) return "?";
    if (character === "\\" || character === "(" || character === ")") return `\\${character}`;
    if (code > 126) return `\\${code.toString(8).padStart(3, "0")}`;
    return character;
  }).join("");
}

export function buildPdfBlob(title: string, doc: unknown): Blob {
  const lines: PdfLine[] = [];
  const trimmedTitle = title.trim();
  if (trimmedTitle) {
    lines.push({ text: trimmedTitle, size: 18, font: "bold", indent: 0 });
  }

  lines.push(...collectPdfLines(doc));

  if (lines.length === 0) {
    lines.push({ text: "This document is empty.", size: 12, font: "normal", indent: 0 });
  }

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const startY = pageHeight - 60;
  const contentStream = lines
    .map((line, index) => {
      const fontNumber = line.font === "bold" ? 2 : line.font === "italic" ? 3 : 1;
      const y = startY - index * 22;
      const indent = 50 + line.indent;
      return `BT /F${fontNumber} ${line.size.toFixed(2)} Tf ${indent.toFixed(2)} ${y.toFixed(2)} Td (${escapePdfText(line.text)}) Tj ET`;
    })
    .join("\n");

  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 4 0 R /F2 5 0 R /F3 6 0 R >> >> /Contents 7 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>",
    `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream`,
  ];

  const pdfParts: string[] = ["%PDF-1.4\n"];
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdfParts.join("").length + 1);
    pdfParts.push(`${i + 1} 0 obj\n${objects[i]}\nendobj\n`);
  }

  const xrefOffset = pdfParts.join("").length;
  pdfParts.push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (let i = 1; i < offsets.length; i++) {
    pdfParts.push(`${String(offsets[i]).padStart(10, "0")} 00000 n \n`);
  }
  pdfParts.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob([pdfParts.join("")], { type: "application/pdf" });
}
