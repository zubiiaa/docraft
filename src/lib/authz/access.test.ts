import { describe, expect, it } from "vitest";
import { can, resolveAccess, type AccessSubject } from "./access";

const OWNER = "u_owner";
const VIEWER = "u_viewer";
const EDITOR = "u_editor";
const STRANGER = "u_stranger";

const doc = (): AccessSubject => ({
  ownerId: OWNER,
  shares: [
    { userId: VIEWER, role: "viewer" },
    { userId: EDITOR, role: "editor" },
  ],
});

describe("document access policy", () => {
  it("owner can read, edit, delete and share", () => {
    const a = resolveAccess(doc(), OWNER);
    expect(a).toBe("owner");
    for (const action of ["read", "edit", "delete", "share"] as const) {
      expect(can(a, action)).toBe(true);
    }
  });

  it("an unrelated user has no access and cannot edit", () => {
    const a = resolveAccess(doc(), STRANGER);
    expect(a).toBeNull();
    for (const action of ["read", "edit", "delete", "share"] as const) {
      expect(can(a, action)).toBe(false);
    }
  });

  it("a viewer can read but cannot edit, delete or share", () => {
    const a = resolveAccess(doc(), VIEWER);
    expect(a).toBe("viewer");
    expect(can(a, "read")).toBe(true);
    expect(can(a, "edit")).toBe(false);
    expect(can(a, "delete")).toBe(false);
    expect(can(a, "share")).toBe(false);
  });

  it("an editor can read and edit but cannot delete or change sharing", () => {
    const a = resolveAccess(doc(), EDITOR);
    expect(a).toBe("editor");
    expect(can(a, "read")).toBe(true);
    expect(can(a, "edit")).toBe(true);
    expect(can(a, "delete")).toBe(false);
    expect(can(a, "share")).toBe(false);
  });

  it("a revoked collaborator loses access", () => {
    const before = doc();
    expect(can(resolveAccess(before, EDITOR), "edit")).toBe(true);

    const after: AccessSubject = {
      ...before,
      shares: before.shares.filter((s) => s.userId !== EDITOR),
    };
    const a = resolveAccess(after, EDITOR);
    expect(a).toBeNull();
    expect(can(a, "read")).toBe(false);
    expect(can(a, "edit")).toBe(false);
  });

  it("an empty user id never matches", () => {
    expect(resolveAccess(doc(), "")).toBeNull();
  });
});
