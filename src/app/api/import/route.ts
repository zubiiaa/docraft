import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { DocumentModel } from "@/lib/models/Document";
import { ApiError, handleError, requireUser } from "@/lib/api";
import { markdownToDoc, textToDoc } from "@/lib/import/convert";
import { ContentError, sanitizeDoc } from "@/lib/validation/content";

const MAX_IMPORT_BYTES = 512 * 1024;

// POST /api/import  (multipart/form-data, field "file": .txt or .md)
export async function POST(req: Request) {
  try {
    const user = await requireUser();

    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new ApiError(400, "Expected a file upload");
    }

    const file = form.get("file");
    if (!(file instanceof File)) throw new ApiError(400, "No file was uploaded");

    const name = file.name.trim();
    const match = /\.(txt|md)$/i.exec(name);
    if (!match) throw new ApiError(400, "Unsupported file type. Supported formats: .txt and .md");
    if (file.size === 0) throw new ApiError(400, "The file is empty");
    if (file.size > MAX_IMPORT_BYTES) throw new ApiError(413, "The file is too large (maximum 500 KB)");

    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    } catch {
      throw new ApiError(400, "The file is not valid UTF-8 text");
    }
    text = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
    if (text.includes("\u0000")) throw new ApiError(400, "The file does not look like a text file");
    if (!text.trim()) throw new ApiError(400, "The file contains no readable text");

    const raw = match[1].toLowerCase() === "md" ? markdownToDoc(text) : textToDoc(text);

    let content;
    try {
      content = sanitizeDoc(raw);
    } catch (e) {
      if (e instanceof ContentError) throw new ApiError(400, "This file is too large or complex to import");
      throw e;
    }

    const title = (name.replace(/\.(txt|md)$/i, "").trim() || "Imported document").slice(0, 200);

    await connectDB();
    const doc = await DocumentModel.create({ title, content, ownerId: user.id });
    return NextResponse.json({ document: { id: String(doc._id), title: doc.title } }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
