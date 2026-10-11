import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { DocumentModel } from "@/lib/models/Document";
import { ApiError, handleError, parseBody, requireUser } from "@/lib/api";
import { toFullDto, toListItem, userNames } from "@/lib/dto";
import { createDocSchema } from "@/lib/validation/schemas";
import { ContentError, EMPTY_DOC, sanitizeDoc } from "@/lib/validation/content";

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// GET /api/documents?scope=mine|shared&q=title
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    await connectDB();

    const url = new URL(req.url);
    const scope = url.searchParams.get("scope") === "shared" ? "shared" : "mine";
    const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);

    const filter = {
      ...(scope === "mine" ? { ownerId: user.id } : { "shares.userId": user.id }),
      ...(q ? { title: { $regex: escapeRegex(q), $options: "i" } } : {}),
    };

    const docs = await DocumentModel.find(filter)
      .select("-content")
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();

    const names = await userNames([...new Set(docs.map((d) => String(d.ownerId)))]);
    return NextResponse.json({ documents: docs.map((d) => toListItem(d, user.id, names)) });
  } catch (err) {
    return handleError(err);
  }
}

// POST /api/documents  { title?, content? }
export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = await parseBody(req, createDocSchema);

    let content = EMPTY_DOC;
    if (body.content !== undefined) {
      try {
        content = sanitizeDoc(body.content);
      } catch (e) {
        if (e instanceof ContentError) throw new ApiError(400, e.message);
        throw e;
      }
    }

    await connectDB();
    const created = await DocumentModel.create({
      title: body.title ?? "Untitled document",
      content,
      ownerId: user.id,
    });
    const doc = await DocumentModel.findById(created._id).lean();
    if (!doc) throw new ApiError(500, "Could not create document");

    const names = await userNames([user.id]);
    return NextResponse.json({ document: toFullDto(doc, "owner", names) }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
