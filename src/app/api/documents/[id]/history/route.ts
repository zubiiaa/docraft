import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { DocumentModel, DocumentVersionModel } from "@/lib/models/Document";
import { ApiError, handleError, loadDocument, parseBody, requireUser } from "@/lib/api";
import { userNames } from "@/lib/dto";
import { createDocumentSnapshot, shouldRestoreVersion } from "@/lib/versioning";
import { restoreVersionSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await loadDocument(id, user, "read");

    await connectDB();
    const versions = await DocumentVersionModel.find({ documentId: id }).sort({ createdAt: -1 }).limit(25).lean();
    const names = await userNames([...new Set(versions.map((v) => String(v.createdBy)))]);

    return NextResponse.json({
      versions: versions.map((v) => ({
        id: String(v._id),
        title: v.title,
        createdAt: v.createdAt.toISOString(),
        createdBy: {
          id: String(v.createdBy),
          name: names.get(String(v.createdBy)) ?? "Unknown",
        },
        content: v.content,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const { doc } = await loadDocument(id, user, "edit");

    const { snapshotId } = await parseBody(req, restoreVersionSchema);
    await connectDB();

    const snapshot = await DocumentVersionModel.findOne({ _id: snapshotId, documentId: id }).lean();
    if (!snapshot) throw new ApiError(404, "Version not found");

    const base = {
      title: doc.title,
      content: doc.content,
    };
    const target = {
      title: snapshot.title,
      content: snapshot.content,
    };

    const filter = {
      _id: id,
      $or: [
        { ownerId: user.id },
        { shares: { $elemMatch: { userId: user.id, role: "editor" } } },
      ],
      version: doc.version,
    };

    if (!shouldRestoreVersion(base, target)) {
      return NextResponse.json({ document: { id, title: doc.title, version: doc.version } });
    }

    const updated = await DocumentModel.findOneAndUpdate(
      filter,
      {
        $set: {
          title: snapshot.title,
          content: snapshot.content,
        },
        $inc: { version: 1 },
      },
      { new: true },
    ).select("title version").lean();

    if (!updated) {
      await loadDocument(id, user, "edit");
      throw new ApiError(409, "The document was changed while you were restoring a version.");
    }

    await createDocumentSnapshot({
      docId: id,
      title: snapshot.title,
      content: snapshot.content,
      userId: user.id,
    });

    return NextResponse.json({
      document: {
        id: String(updated._id),
        title: updated.title,
        version: updated.version,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
