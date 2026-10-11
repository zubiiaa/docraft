import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { DocumentModel } from "@/lib/models/Document";
import { ApiError, handleError, loadDocument, parseBody, requireUser } from "@/lib/api";
import { toFullDto, userNames } from "@/lib/dto";
import { patchDocSchema } from "@/lib/validation/schemas";
import { ContentError, sanitizeDoc } from "@/lib/validation/content";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/documents/:id  (owner, editor or viewer)
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const { doc, access } = await loadDocument(id, user, "read");

    const ids = [String(doc.ownerId), ...doc.shares.map((s) => String(s.userId))];
    const names = await userNames([...new Set(ids)]);
    return NextResponse.json({ document: toFullDto(doc, access, names) });
  } catch (err) {
    return handleError(err);
  }
}

// PATCH /api/documents/:id  { title?, content?, baseVersion? }  (owner or editor)
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await loadDocument(id, user, "edit"); // 404 / 403 before anything else

    const body = await parseBody(req, patchDocSchema);

    await connectDB();
    let content;
    if (body.content !== undefined) {
      try {
        content = sanitizeDoc(body.content);
      } catch (e) {
        if (e instanceof ContentError) throw new ApiError(400, e.message);
        throw e;
      }
    }

    const $set = {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(content ? { content } : {}),
    };

    // Authorization is repeated inside the write filter so a revoked collaborator
    // cannot slip a save in between the check above and the update.
    // Content saves also require the client's baseVersion to match: a stale
    // autosave matches nothing and is rejected with 409 instead of overwriting.
    const filter = {
      _id: id,
      $or: [
        { ownerId: user.id },
        { shares: { $elemMatch: { userId: user.id, role: "editor" } } },
      ],
      ...(content ? { version: body.baseVersion } : {}),
    };
    const update = {
      $set,
      ...(content ? { $inc: { version: 1 } } : {}),
    };

    const updated = await DocumentModel.findOneAndUpdate(filter, update, { new: true })
      .select("title version updatedAt")
      .lean();

    if (!updated) {
      // Re-check: throws 404/403 if access was lost; otherwise it's a version conflict.
      const { doc } = await loadDocument(id, user, "edit");
      throw new ApiError(409, "This document was changed elsewhere. Reload to get the latest version.", {
        currentVersion: doc.version,
      });
    }

    return NextResponse.json({
      document: {
        id: String(updated._id),
        title: updated.title,
        version: updated.version,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

// DELETE /api/documents/:id  (owner only)
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await loadDocument(id, user, "delete"); // 404 / 403

    await connectDB();
    const result = await DocumentModel.deleteOne({ _id: id, ownerId: user.id });
    if (result.deletedCount === 0) throw new ApiError(404, "Document not found");
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return handleError(err);
  }
}
