import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { CommentModel } from "@/lib/models/Document";
import { ApiError, handleError, loadDocument, parseBody, requireUser } from "@/lib/api";
import { userNames } from "@/lib/dto";
import { sanitizeCommentText } from "@/lib/versioning";
import { commentSchema } from "@/lib/validation/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const user = await requireUser();
    await loadDocument(id, user, "read");

    await connectDB();
    const comments = await CommentModel.find({ documentId: id }).sort({ createdAt: -1 }).lean();
    const names = await userNames([...new Set(comments.map((c) => String(c.authorId)))]);

    return NextResponse.json({
      comments: comments.map((c) => ({
        id: String(c._id),
        text: c.text,
        createdAt: c.createdAt.toISOString(),
        author: {
          id: String(c.authorId),
          name: names.get(String(c.authorId)) ?? "Unknown",
        },
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
    await loadDocument(id, user, "edit");

    const { text } = await parseBody(req, commentSchema);
    const normalized = sanitizeCommentText(text);

    await connectDB();
    const comment = await CommentModel.create({
      documentId: id,
      authorId: user.id,
      text: normalized,
    });

    return NextResponse.json(
      {
        comment: {
          id: String(comment._id),
          text: comment.text,
          createdAt: comment.createdAt.toISOString(),
          author: { id: user.id, name: user.name },
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}
