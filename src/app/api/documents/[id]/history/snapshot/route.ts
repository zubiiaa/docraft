import { NextResponse } from "next/server";
import { ApiError, handleError, loadDocument, parseBody, requireUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { DocumentModel, DocumentVersionModel } from "@/lib/models/Document";
import { patchDocSchema } from "@/lib/validation/schemas";
import {
  AUTOMATIC_SNAPSHOT_INTERVAL_MS,
  automaticSnapshotRetryAfter,
  createDocumentSnapshot,
  shouldCreateAutomaticSnapshot,
  shouldCreateSnapshot,
} from "@/lib/versioning";
import { ContentError, sanitizeDoc } from "@/lib/validation/content";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = await requireUser();
    const { doc } = await loadDocument(id, user, "edit");
    const body = await parseBody(_req, patchDocSchema);
    if (body.content === undefined || body.baseVersion === undefined) {
      throw new ApiError(400, "Snapshot content and baseVersion are required");
    }
    await connectDB();

    let content;
    let persistedContent;
    try {
      content = sanitizeDoc(body.content);
      persistedContent = sanitizeDoc(doc.content);
    } catch (error) {
      if (error instanceof ContentError) throw new ApiError(400, error.message);
      throw error;
    }

    const current = { title: doc.title.trim(), content: persistedContent };
    const requested = { title: (body.title ?? doc.title).trim(), content };
    if (body.baseVersion !== doc.version || shouldCreateSnapshot(current, requested)) {
      return NextResponse.json({ created: false, retryAfterMs: 0 });
    }
    const latest = await DocumentVersionModel.findOne({ documentId: id }).sort({ createdAt: -1 }).lean();
    const now = new Date();
    if (!shouldCreateAutomaticSnapshot(latest, current, doc.lastAutomaticSnapshotAt, now.getTime())) {
      const changed = !latest || shouldCreateSnapshot(latest, current);
      return NextResponse.json({
        created: false,
        retryAfterMs: changed ? automaticSnapshotRetryAfter(doc.lastAutomaticSnapshotAt, now.getTime()) : 0,
      });
    }

    const authorization = [
      { ownerId: user.id },
      { shares: { $elemMatch: { userId: user.id, role: "editor" } } },
    ];
    const intervalStart = new Date(now.getTime() - AUTOMATIC_SNAPSHOT_INTERVAL_MS);
    const claim = await DocumentModel.findOneAndUpdate(
      {
        _id: id,
        version: doc.version,
        title: doc.title,
        $and: [
          { $or: authorization },
          {
            $or: [
              { lastAutomaticSnapshotAt: { $exists: false } },
              { lastAutomaticSnapshotAt: null },
              { lastAutomaticSnapshotAt: { $lte: intervalStart } },
            ],
          },
        ],
      },
      { $set: { lastAutomaticSnapshotAt: now } },
      { new: true },
    )
      .select("_id")
      .lean();

    if (!claim) {
      await loadDocument(id, user, "edit");
      const latestDocument = await DocumentModel.findById(id).select("lastAutomaticSnapshotAt").lean();
      const retryAfterMs = automaticSnapshotRetryAfter(latestDocument?.lastAutomaticSnapshotAt, Date.now());
      return NextResponse.json({ created: false, retryAfterMs: retryAfterMs || 1000 });
    }

    const snapshot = await createDocumentSnapshot({
      docId: id,
      title: current.title,
      content: current.content,
      userId: user.id,
    });

    if (!snapshot) {
      await DocumentModel.updateOne({ _id: id, lastAutomaticSnapshotAt: now }, { $unset: { lastAutomaticSnapshotAt: 1 } });
      return NextResponse.json({ created: false, retryAfterMs: 0 });
    }

    return NextResponse.json({ created: true, retryAfterMs: 0 });
  } catch (error) {
    return handleError(error);
  }
}
