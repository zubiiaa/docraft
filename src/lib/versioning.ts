import { connectDB } from "./db";
import { DocumentVersionModel } from "./models/Document";
import { EMPTY_DOC } from "./validation/content";

export const AUTOMATIC_SNAPSHOT_INTERVAL_MS = 30_000;

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeJson);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeJson(item)]),
  );
}

function snapshotKey(snapshot: { title: string; content: unknown }): string {
  return JSON.stringify([String(snapshot.title ?? "").trim(), normalizeJson(snapshot.content ?? EMPTY_DOC)]);
}

export function sanitizeCommentText(raw: string): string {
  const text = raw.trim();
  if (!text) throw new Error("Comment cannot be empty");
  if (text.length > 4000) throw new Error("Comment is too long");
  return text;
}

export function shouldCreateSnapshot(
  current: { title: string; content: unknown },
  next: { title: string; content: unknown },
): boolean {
  return snapshotKey(current) !== snapshotKey(next);
}

export function automaticSnapshotRetryAfter(lastSnapshotAt: Date | null | undefined, now = Date.now()): number {
  if (!lastSnapshotAt) return 0;
  return Math.max(0, lastSnapshotAt.getTime() + AUTOMATIC_SNAPSHOT_INTERVAL_MS - now);
}

export function shouldCreateAutomaticSnapshot(
  latest: { title: string; content: unknown } | null,
  current: { title: string; content: unknown },
  lastSnapshotAt: Date | null | undefined,
  now = Date.now(),
): boolean {
  return (!latest || shouldCreateSnapshot(latest, current)) && automaticSnapshotRetryAfter(lastSnapshotAt, now) === 0;
}

export function shouldRestoreVersion(
  current: { title: string; content: unknown },
  target: { title: string; content: unknown },
): boolean {
  return shouldCreateSnapshot(current, target);
}

export async function createDocumentSnapshot({
  docId,
  title,
  content,
  userId,
}: {
  docId: string;
  title: string;
  content: unknown;
  userId: string;
}) {
  await connectDB();
  const latest = await DocumentVersionModel.findOne({ documentId: docId }).sort({ createdAt: -1 }).lean();
  const snapshot = {
    title,
    content,
    documentId: docId,
    createdBy: userId,
  };

  if (latest && !shouldCreateSnapshot(latest, snapshot)) return null;

  return DocumentVersionModel.create(snapshot);
}
