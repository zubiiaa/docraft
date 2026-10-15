import { describe, expect, it } from "vitest";
import { docToMarkdown } from "./markdown";
import { markdownToDoc } from "../import/convert";
import { sanitizeDoc, type DocNode } from "../validation/content";

const text = (value: string, ...marks: string[]): DocNode =>
  marks.length ? { type: "text", text: value, marks: marks.map((type) => ({ type })) } : { type: "text", text: value };
const paragraph = (...content: DocNode[]): DocNode => ({ type: "paragraph", content });
const item = (...content: DocNode[]): DocNode => ({ type: "listItem", content });
const doc = (...content: DocNode[]): DocNode => ({ type: "doc", content });

function mergeText(node: DocNode): DocNode {
  if (node.marks) node = { ...node, marks: [...node.marks].sort((a, b) => a.type.localeCompare(b.type)) };
  if (!node.content) return node;
  const merged: DocNode[] = [];
  for (const child of node.content.map(mergeText)) {
    const last = merged[merged.length - 1];
    if (
      last?.type === "text" &&
      child.type === "text" &&
      JSON.stringify(last.marks ?? []) === JSON.stringify(child.marks ?? [])
    ) {
      merged[merged.length - 1] = { ...last, text: `${last.text}${child.text}` };
    } else {
      merged.push(child);
    }
  }
  return { ...node, content: merged };
}

function roundTrip(input: DocNode): DocNode {
  const markdown = docToMarkdown("", input);
  return mergeText(sanitizeDoc(markdownToDoc(markdown)));
}

describe("docToMarkdown", () => {
  it("writes bold and italic markers without escaping them", () => {
    const markdown = docToMarkdown("", doc(paragraph(text("plain "), text("bold", "bold"), text(" and "), text("it", "italic"))));
    expect(markdown).toBe("plain **bold** and *it*\n");
  });

  it("nests overlapping marks instead of stacking delimiters", () => {
    const markdown = docToMarkdown("", doc(paragraph(text("a", "bold"), text("b", "bold", "italic"), text("c"))));
    expect(markdown).toBe("**a*b***c\n");
  });

  it("keeps whitespace outside emphasis delimiters", () => {
    expect(docToMarkdown("", doc(paragraph(text("x"), text(" bold ", "bold"), text("y"))))).toBe("x **bold** y\n");
  });

  it("escapes literal markdown characters in text", () => {
    const markdown = docToMarkdown("", doc(paragraph(text("2 * 3 = _six_ <tag> [link]"))));
    expect(markdown).toBe("2 \\* 3 = \\_six\\_ \\<tag\\> \\[link\\]\n");
  });

  it("escapes text that would otherwise start a heading or list", () => {
    expect(docToMarkdown("", doc(paragraph(text("# not a heading"))))).toBe("\\# not a heading\n");
    expect(docToMarkdown("", doc(paragraph(text("- not a list"))))).toBe("\\- not a list\n");
    expect(docToMarkdown("", doc(paragraph(text("1. not a list"))))).toBe("1\\. not a list\n");
  });

  it("does not over-escape ordinary punctuation", () => {
    expect(docToMarkdown("", doc(paragraph(text("e.g. well-known (really)!"))))).toBe("e.g. well-known (really)!\n");
  });

  it("renders nested lists with indentation instead of flattening them", () => {
    const input = doc({
      type: "bulletList",
      content: [
        item(paragraph(text("parent")), {
          type: "orderedList",
          attrs: { start: 3 },
          content: [item(paragraph(text("child one"))), item(paragraph(text("child two")))],
        }),
        item(paragraph(text("sibling"))),
      ],
    });
    expect(docToMarkdown("", input)).toBe("- parent\n  3. child one\n  4. child two\n- sibling\n");
  });

  it("keeps separate paragraphs inside one list item apart", () => {
    const input = doc({ type: "bulletList", content: [item(paragraph(text("first")), paragraph(text("second")))] });
    expect(docToMarkdown("", input)).toBe("- first\n\n  second\n");
    expect(roundTrip(input)).toEqual(mergeText(sanitizeDoc(input)));
  });

  it("escapes a trailing hash run so headings keep it", () => {
    const input = doc({ type: "heading", attrs: { level: 2 }, content: [text("Learning C #")] });
    expect(docToMarkdown("", input)).toBe("## Learning C \\#\n");
    expect(roundTrip(input)).toEqual(mergeText(sanitizeDoc(input)));
  });

  it("renders hard breaks as CommonMark hard line breaks", () => {
    expect(docToMarkdown("", doc(paragraph(text("one"), { type: "hardBreak" }, text("two"))))).toBe("one\\\ntwo\n");
  });

  it("prefixes the title as a top-level heading", () => {
    expect(docToMarkdown("My *Doc*", doc(paragraph(text("body"))))).toBe("# My \\*Doc\\*\n\nbody\n");
  });

  it("round-trips through the importer", () => {
    const input = doc(
      { type: "heading", attrs: { level: 2 }, content: [text("Plan "), text("A", "bold")] },
      paragraph(text("Mixed "), text("bold", "bold"), text(", "), text("both", "bold", "italic"), text(" and *stars*")),
      paragraph(text("line one"), { type: "hardBreak" }, text("line two")),
      {
        type: "orderedList",
        attrs: { start: 1 },
        content: [
          item(paragraph(text("first")), {
            type: "bulletList",
            content: [item(paragraph(text("nested "), text("item", "italic")))],
          }),
          item(paragraph(text("1. literal"))),
        ],
      },
    );
    expect(roundTrip(input)).toEqual(mergeText(sanitizeDoc(input)));
  });
});
