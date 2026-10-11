import { describe, expect, it } from "vitest";
import { markdownToDoc, textToDoc } from "./convert";
import { sanitizeDoc } from "../validation/content";

describe("markdownToDoc", () => {
  it("maps headings, bold/italic and lists", () => {
    const doc = markdownToDoc(
      "# Title\n\nSome **bold** and *italic* text.\n\n- one\n- two\n\n1. first\n2. second\n",
    );
    expect(doc.content!.map((n) => n.type)).toEqual(["heading", "paragraph", "bulletList", "orderedList"]);
    expect(doc.content![0].attrs).toEqual({ level: 1 });

    const para = doc.content![1].content!;
    expect(para.some((n) => n.text === "bold" && n.marks?.[0].type === "bold")).toBe(true);
    expect(para.some((n) => n.text === "italic" && n.marks?.[0].type === "italic")).toBe(true);

    expect(doc.content![2].content).toHaveLength(2);
    expect(doc.content![3].content).toHaveLength(2);
    expect(() => sanitizeDoc(doc)).not.toThrow();
  });

  it("clamps deep headings to level 3", () => {
    const doc = markdownToDoc("#### Deep");
    expect(doc.content![0].attrs).toEqual({ level: 3 });
  });

  it("keeps raw HTML as inert text, never as a node", () => {
    const doc = markdownToDoc("<script>alert(1)</script>\n\nhello");
    const json = JSON.stringify(doc);
    expect(json).toContain("<script>alert(1)</script>");
    expect(json).not.toContain('"type":"script"');
    expect(json).not.toContain('"type":"html"');
    expect(() => sanitizeDoc(doc)).not.toThrow();
  });

  it("drops link targets and keeps the link text", () => {
    const doc = markdownToDoc("[click me](javascript:alert(1))");
    const json = JSON.stringify(doc);
    expect(json).toContain("click me");
    expect(json).not.toContain("javascript:");
  });
});

describe("textToDoc", () => {
  it("splits paragraphs on blank lines and keeps line breaks", () => {
    const doc = textToDoc("line one\nline two\n\nsecond paragraph");
    expect(doc.content).toHaveLength(2);
    expect(doc.content![0].content!.map((n) => n.type)).toEqual(["text", "hardBreak", "text"]);
    expect(() => sanitizeDoc(doc)).not.toThrow();
  });
});
