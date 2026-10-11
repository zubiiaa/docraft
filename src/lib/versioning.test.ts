import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelDebouncedTask, scheduleDebouncedTask } from "./debounce";
import {
  automaticSnapshotRetryAfter,
  sanitizeCommentText,
  shouldCreateAutomaticSnapshot,
  shouldCreateSnapshot,
  shouldRestoreVersion,
} from "./versioning";

afterEach(() => vi.useRealTimers());

describe("comment validation", () => {
  it("rejects empty or oversized comments", () => {
    expect(() => sanitizeCommentText("   ")).toThrow();
    expect(() => sanitizeCommentText("x".repeat(4001))).toThrow();
  });

  it("trims and preserves meaningful content", () => {
    expect(sanitizeCommentText("  Hello world  ")).toBe("Hello world");
  });
});

describe("snapshot decisions", () => {
  it("creates a snapshot when the title or content changes", () => {
    expect(
      shouldCreateSnapshot(
        { title: "Old title", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "old" }] }] } },
        { title: "New title", content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "new" }] }] } },
      ),
    ).toBe(true);
  });

  it("skips duplicate snapshots for unchanged content", () => {
    const doc = {
      title: "Same title",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "same" }] }] },
    };
    expect(shouldCreateSnapshot(doc, doc)).toBe(false);
  });

  it("normalizes title whitespace and JSON key order for duplicate checks", () => {
    expect(
      shouldCreateSnapshot(
        { title: " Same title ", content: { type: "doc", attrs: { b: 2, a: 1 } } },
        { title: "Same title", content: { attrs: { a: 1, b: 2 }, type: "doc" } },
      ),
    ).toBe(false);
  });

  it("enforces the minimum automatic snapshot interval", () => {
    const now = new Date("2026-10-11T12:00:30.000Z");
    const previous = new Date("2026-10-11T12:00:00.000Z");
    const changed = { title: "Draft", content: { type: "doc", content: [] } };

    expect(automaticSnapshotRetryAfter(previous, now.getTime())).toBe(0);
    expect(shouldCreateAutomaticSnapshot(null, changed, previous, now.getTime())).toBe(true);
    expect(automaticSnapshotRetryAfter(new Date(previous.getTime() + 1), now.getTime())).toBe(1);
    expect(shouldCreateAutomaticSnapshot(null, changed, new Date(previous.getTime() + 1), now.getTime())).toBe(false);
  });

  it("does not create automatic snapshots when the latest version is unchanged", () => {
    const document = { title: "Draft", content: { type: "doc", content: [] } };
    expect(shouldCreateAutomaticSnapshot(document, document, undefined)).toBe(false);
  });

  it("keeps version restoration a no-op when restoring the current content", () => {
    const current = { title: "Draft", content: { type: "doc", content: [{ type: "paragraph" }] } };
    expect(shouldRestoreVersion(current, current)).toBe(false);
    expect(shouldRestoreVersion(current, { title: "Older", content: { type: "doc", content: [] } })).toBe(true);
  });
});

describe("snapshot debounce", () => {
  it("restarts the delay when new edits schedule another snapshot", () => {
    vi.useFakeTimers();
    const timerRef = { current: null as ReturnType<typeof setTimeout> | null };
    const snapshot = vi.fn();

    scheduleDebouncedTask(timerRef, snapshot, 10_000);
    vi.advanceTimersByTime(9_000);
    scheduleDebouncedTask(timerRef, snapshot, 10_000);
    vi.advanceTimersByTime(9_999);
    expect(snapshot).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(snapshot).toHaveBeenCalledTimes(1);
    cancelDebouncedTask(timerRef);
  });
});
