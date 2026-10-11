/**
 * The entire permission model, as pure functions.
 *
 *   owner  -> read, edit, delete, share
 *   editor -> read, edit
 *   viewer -> read
 *   none   -> nothing
 *
 * No database or HTTP code lives here so the rules are trivial to unit test.
 */
export type Role = "viewer" | "editor";
export type Access = "owner" | Role;
export type Action = "read" | "edit" | "delete" | "share";

export interface AccessSubject {
  ownerId: string;
  shares: ReadonlyArray<{ userId: string; role: Role }>;
}

const PERMISSIONS: Record<Access, readonly Action[]> = {
  owner: ["read", "edit", "delete", "share"],
  editor: ["read", "edit"],
  viewer: ["read"],
};

export function resolveAccess(doc: AccessSubject, userId: string): Access | null {
  if (!userId) return null;
  if (doc.ownerId === userId) return "owner";
  return doc.shares.find((s) => s.userId === userId)?.role ?? null;
}

export function can(access: Access | null, action: Action): boolean {
  return access !== null && PERMISSIONS[access].includes(action);
}
