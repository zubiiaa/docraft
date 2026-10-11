import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { DocumentModel } from "@/lib/models/Document";
import { UserModel } from "@/lib/models/User";
import { ApiError, handleError, loadDocument, parseBody, requireUser } from "@/lib/api";
import { userNames } from "@/lib/dto";
import { OBJECT_ID_RE, shareSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

async function sharesPayload(id: string) {
  const doc = await DocumentModel.findById(id).select("shares").lean();
  const shares = doc?.shares ?? [];
  const names = await userNames(shares.map((s) => String(s.userId)));
  return shares.map((s) => ({
    userId: String(s.userId),
    name: names.get(String(s.userId)) ?? "Unknown",
    role: s.role,
  }));
}

// POST /api/documents/:id/shares  { userId, role }  (owner only; grants or changes a role)
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await loadDocument(id, user, "share"); // owner only: 404 / 403

    const { userId, role } = await parseBody(req, shareSchema);
    if (userId === user.id) throw new ApiError(400, "You already own this document");

    await connectDB();
    const target = await UserModel.findById(userId).select("_id").lean();
    if (!target) throw new ApiError(404, "That user does not exist");

    // Update the role if the user already has access...
    const updated = await DocumentModel.updateOne(
      { _id: id, ownerId: user.id, "shares.userId": userId },
      { $set: { "shares.$.role": role } },
    );
    // ...otherwise add a new share.
    if (updated.matchedCount === 0) {
      await DocumentModel.updateOne(
        { _id: id, ownerId: user.id, "shares.userId": { $ne: userId } },
        { $push: { shares: { userId, role } } },
      );
    }

    return NextResponse.json({ shares: await sharesPayload(id) });
  } catch (err) {
    return handleError(err);
  }
}

// DELETE /api/documents/:id/shares?userId=...  (owner only; revokes access)
export async function DELETE(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await loadDocument(id, user, "share");

    const userId = new URL(req.url).searchParams.get("userId") ?? "";
    if (!OBJECT_ID_RE.test(userId)) throw new ApiError(400, "Invalid user id");

    await connectDB();
    await DocumentModel.updateOne(
      { _id: id, ownerId: user.id },
      { $pull: { shares: { userId } } },
    );
    return NextResponse.json({ shares: await sharesPayload(id) });
  } catch (err) {
    return handleError(err);
  }
}
