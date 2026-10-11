import { describe, expect, it } from "vitest";
import { ContentError, sanitizeDoc } from "./content";

const valid = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Hi" }] },
    {
      type: "paragraph",
      content: [{ type: "text", text: "bold", marks: [{ type: "bold" }] }],
    },
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "a" }] }] },
      ],
    },
  ],
};

describe("sanitizeDoc", () => {
  it("accepts supported structure and keeps formatting", () => {
    const out = sanitizeDoc(valid);
    expect(out.content?.[0].attrs).toEqual({ level: 2 });
    expect(out.content?.[1].content?.[0].marks).toEqual([{ type: "bold" }]);
  });

  it("rejects unsupported node types such as scripts or HTML", () => {
    const bad = { type: "doc", content: [{ type: "script", content: [] }] };
    expect(() => sanitizeDoc(bad)).toThrow(ContentError);
  });

  it("rejects unsupported marks such as links", () => {
    const bad = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }],
        },
      ],
    };
    expect(() => sanitizeDoc(bad)).toThrow(ContentError);
  });

  it("rejects invalid heading levels and non-doc roots", () => {
    expect(() =>
      sanitizeDoc({ type: "doc", content: [{ type: "heading", attrs: { level: 9 }, content: [] }] }),
    ).toThrow(ContentError);
    expect(() => sanitizeDoc({ type: "paragraph" })).toThrow(ContentError);
    expect(() => sanitizeDoc(null)).toThrow(ContentError);
  });

  it("drops unknown attributes instead of storing them", () => {
    const out = sanitizeDoc({
      type: "doc",
      content: [{ type: "paragraph", attrs: { onclick: "evil()" } }],
    });
    expect(out.content?.[0].attrs).toBeUndefined();
  });
});
