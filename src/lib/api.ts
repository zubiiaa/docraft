import { NextResponse } from "next/server";
import type { z } from "zod";
import { connectDB } from "@/lib/db";
import { DocumentModel } from "@/lib/models/Document";
import { getCurrentUser, type SessionUser } from "@/lib/auth/session";
import { resolveAccess, can, type Action } from "@/lib/authz/access";
import { OBJECT_ID_RE } from "@/lib/validation/schemas";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export function handleError(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message, ...err.extra }, { status: err.status });
  }
  console.error("[api] unexpected error:", err);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "You need to log in");
  return user;
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  const raw: unknown = await req.json().catch(() => null);
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiError(400, result.error.issues[0]?.message ?? "Invalid request");
  }
  return result.data;
}

/**
 * Loads a document and enforces permissions.
 *  - No access at all  -> 404 (don't reveal that the document exists)
 *  - Access, wrong role -> 403
 */
export async function loadDocument(id: string, user: SessionUser, action: Action) {
  if (!OBJECT_ID_RE.test(id)) throw new ApiError(404, "Document not found");
  await connectDB();

  const doc = await DocumentModel.findById(id).lean();
  if (!doc) throw new ApiError(404, "Document not found");

  const access = resolveAccess(
    {
      ownerId: String(doc.ownerId),
      shares: doc.shares.map((s) => ({ userId: String(s.userId), role: s.role })),
    },
    user.id,
  );
  if (!access) throw new ApiError(404, "Document not found");
  if (!can(access, action)) throw new ApiError(403, "You don't have permission to do that");

  return { doc, access };
}
