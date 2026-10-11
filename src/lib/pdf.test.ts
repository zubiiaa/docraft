import { describe, expect, it } from "vitest";
import { buildPdfBlob } from "./pdf";

describe("buildPdfBlob", () => {
  it("keeps heading and list structure in the generated PDF", async () => {
    const blob = buildPdfBlob("Quarterly Report", {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Summary" }],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Key win", marks: [{ type: "bold" }] }] }],
            },
          ],
        },
      ],
    });

    const pdfText = await blob.text();
    expect(pdfText).toContain("Summary");
    expect(pdfText).toContain("Key win");
    expect(pdfText).toContain("Helvetica-Bold");
    expect(pdfText).toContain("/Encoding /WinAnsiEncoding");
    expect(pdfText).toContain("\\225 Key win");
  });
});
