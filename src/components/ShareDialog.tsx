"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { api, displayName, errorMessage } from "@/lib/client";
import type { ShareRole, ShareRow } from "@/lib/types";

type DemoUser = { id: string; name: string };

export default function ShareDialog({
  docId,
  ownerId,
  shares,
  onChange,
  onClose,
}: {
  docId: string;
  ownerId: string;
  shares: ShareRow[];
  onChange: (shares: ShareRow[]) => void;
  onClose: () => void;
}) {
  const [users, setUsers] = useState<DemoUser[] | null>(null);
  const [pick, setPick] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    api<{ users: DemoUser[] }>("/api/users")
      .then((r) => setUsers(r.users))
      .catch((e) => {
        setUsers([]);
        setMessage({ kind: "error", text: errorMessage(e, "Could not load users") });
      });
  }, []);

  const candidates = (users ?? []).filter(
    (u) => u.id !== ownerId && !shares.some((s) => s.userId === u.id),
  );
  const selected = candidates.some((c) => c.id === pick) ? pick : (candidates[0]?.id ?? "");

  async function grant(userId: string, newRole: ShareRole, name: string, verb: string) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ shares: ShareRow[] }>(`/api/documents/${docId}/shares`, {
        method: "POST",
        body: { userId, role: newRole },
      });
      onChange(r.shares);
      setMessage({ kind: "ok", text: `${verb} ${displayName(name)} as ${newRole === "editor" ? "an editor" : "a viewer"}.` });
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e, "Could not update sharing") });
    }
    setBusy(false);
  }

  async function revoke(row: ShareRow) {
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<{ shares: ShareRow[] }>(
        `/api/documents/${docId}/shares?userId=${encodeURIComponent(row.userId)}`,
        { method: "DELETE" },
      );
      onChange(r.shares);
      setMessage({ kind: "ok", text: `Removed access for ${displayName(row.name)}.` });
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e, "Could not revoke access") });
    }
    setBusy(false);
  }

  return (
    <Modal title="Share document" onClose={onClose}>
      <div>
        <h3 className="text-sm font-semibold">People with access</h3>
        {shares.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Only you can see this document.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line rounded-md border border-line">
            {shares.map((s) => (
              <li key={s.userId} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="text-sm font-medium">{displayName(s.name)}</span>
                <span className="flex items-center gap-2">
                  <label htmlFor={`role-${s.userId}`} className="sr-only">
                    Role for {displayName(s.name)}
                  </label>
                  <select
                    id={`role-${s.userId}`}
                    value={s.role}
                    disabled={busy}
                    onChange={(e) => void grant(s.userId, e.target.value as ShareRole, s.name, "Updated")}
                    className="rounded-md border border-line bg-surface px-2 py-1 text-sm"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void revoke(s)}
                    className="rounded px-2 py-1 text-sm text-danger hover:bg-danger-soft disabled:opacity-60"
                  >
                    Remove
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold">Add a person</h3>
        {users === null ? (
          <p className="mt-2 text-sm text-muted">Loading…</p>
        ) : candidates.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Everyone has been given access already.</p>
        ) : (
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const user = candidates.find((c) => c.id === selected);
              if (user) void grant(user.id, role, user.name, "Shared with");
            }}
          >
            <label htmlFor="share-user" className="sr-only">
              Person
            </label>
            <select
              id="share-user"
              value={selected}
              onChange={(e) => setPick(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-2 text-sm"
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {displayName(c.name)}
                </option>
              ))}
            </select>
            <label htmlFor="share-role" className="sr-only">
              Role
            </label>
            <select
              id="share-role"
              value={role}
              onChange={(e) => setRole(e.target.value as ShareRole)}
              className="rounded-md border border-line bg-surface px-2 py-2 text-sm"
            >
              <option value="viewer">Viewer (read only)</option>
              <option value="editor">Editor (can edit)</option>
            </select>
            <button
              type="submit"
              disabled={busy || !selected}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              Share
            </button>
          </form>
        )}
      </div>

      <div aria-live="polite" className="mt-3 min-h-5 text-sm">
        {message && (
          <p className={message.kind === "error" ? "text-danger" : "text-accent"}>{message.text}</p>
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button type="button" onClick={onClose} className="rounded-md border border-line px-3 py-2 text-sm hover:bg-canvas">
          Done
        </button>
      </div>
    </Modal>
  );
}
