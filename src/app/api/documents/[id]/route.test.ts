import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { SessionUser } from "@/lib/auth/session";

const session = vi.hoisted(() => ({ user: null as SessionUser | null }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: async () => session.user }));

const { DELETE } = await import("./route");
const { CommentModel, DocumentModel, DocumentVersionModel } = await import("@/lib/models/Document");
const { UserModel } = await import("@/lib/models/User");

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri("docraft-test");
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

beforeEach(async () => {
  const { connectDB } = await import("@/lib/db");
  await connectDB();
  await mongoose.connection.db?.dropDatabase();
});

async function seed() {
  const [owner, editor] = await UserModel.create([
    { name: "owner", email: "owner@test.dev" },
    { name: "editor", email: "editor@test.dev" },
  ]);
  const [target, other] = await DocumentModel.create([
    { title: "Target", ownerId: owner._id, shares: [{ userId: editor._id, role: "editor" }] },
    { title: "Other", ownerId: owner._id },
  ]);
  for (const doc of [target, other]) {
    await CommentModel.create({ documentId: doc._id, authorId: owner._id, text: "note" });
    await DocumentVersionModel.create({ documentId: doc._id, title: doc.title, content: doc.content, createdBy: owner._id });
  }
  const asUser = (user: typeof owner): SessionUser => ({ id: String(user._id), name: user.name, email: user.email });
  return { owner: asUser(owner), editor: asUser(editor), target: String(target._id), other: String(other._id) };
}

function remove(id: string) {
  return DELETE(new Request(`http://test/api/documents/${id}`, { method: "DELETE" }), {
    params: Promise.resolve({ id }),
  });
}

describe("DELETE /api/documents/:id", () => {
  it("removes the document's comments and version history with it", async () => {
    const { owner, target, other } = await seed();
    session.user = owner;

    const res = await remove(target);

    expect(res.status).toBe(204);
    expect(await DocumentModel.exists({ _id: target })).toBeNull();
    expect(await CommentModel.countDocuments({ documentId: target })).toBe(0);
    expect(await DocumentVersionModel.countDocuments({ documentId: target })).toBe(0);
    expect(await CommentModel.countDocuments({ documentId: other })).toBe(1);
    expect(await DocumentVersionModel.countDocuments({ documentId: other })).toBe(1);
  });

  it("leaves everything in place when a non-owner tries to delete", async () => {
    const { editor, target } = await seed();
    session.user = editor;

    const res = await remove(target);

    expect(res.status).toBe(403);
    expect(await DocumentModel.exists({ _id: target })).not.toBeNull();
    expect(await CommentModel.countDocuments({ documentId: target })).toBe(1);
    expect(await DocumentVersionModel.countDocuments({ documentId: target })).toBe(1);
  });
});
