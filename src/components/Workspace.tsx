"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { api, displayName, errorMessage, HttpError, timeAgo } from "@/lib/client";
import type { Role } from "@/lib/types";

type Scope = "mine" | "shared";
type Item = {
  id: string;
  title: string;
  role: Role | null;
  owner: { id: string; name: string };
  sharedCount?: number;
  updatedAt: string;
};
type Result = { key: string; docs?: Item[]; error?: string };
type Notice = { kind: "ok" | "error"; text: string; href?: string };

const MAX_IMPORT_BYTES = 512 * 1024;

function RoleBadge({ role }: { role: Role | null }) {
  if (!role) return null;
  const styles =
    role === "owner"
      ? "bg-accent-soft text-accent"
      : role === "editor"
        ? "bg-amber-50 text-amber-800"
        : "bg-stone-100 text-stone-700";
  const label = role === "owner" ? "Owner" : role === "editor" ? "Can edit" : "View only";
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>{label}</span>;
}

export default function Workspace({ user }: { user: { id: string; name: string } }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const ignoreBlur = useRef(false); // prevents double-commit (Enter then blur) and commit-after-Escape

  const [scope, setScope] = useState<Scope>("mine");
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; value: string } | null>(null);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);

  // Debounce the search box.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Load the list. "loading" is derived (result key != current key), not set in the effect.
  const key = `${scope}|${query}|${reload}`;
  useEffect(() => {
    const ctrl = new AbortController();
    api<{ documents: Item[] }>(`/api/documents?scope=${scope}&q=${encodeURIComponent(query)}`, {
      signal: ctrl.signal,
    })
      .then((r) => setResult({ key, docs: r.documents }))
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof HttpError && e.status === 401) {
          router.push("/login");
          return;
        }
        setResult({ key, error: errorMessage(e, "Could not load documents") });
      });
    return () => ctrl.abort();
  }, [key, scope, query, router]);

  // Auto-dismiss notices.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const loading = result?.key !== key;
  const docs = !loading ? result?.docs : undefined;
  const loadError = !loading ? result?.error : undefined;

  function patchList(fn: (docs: Item[]) => Item[]) {
    setResult((r) => (r && r.docs ? { ...r, docs: fn(r.docs) } : r));
  }

  async function createDoc() {
    setBusy(true);
    try {
      const r = await api<{ document: { id: string } }>("/api/documents", { method: "POST", body: {} });
      router.push(`/docs/${r.document.id}`);
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e, "Could not create the document") });
      setBusy(false);
    }
  }

  async function commitRename() {
    if (!renaming) return;
    const { id } = renaming;
    const title = renaming.value.trim();
    setRenaming(null);
    if (!title) return;
    try {
      await api(`/api/documents/${id}`, { method: "PATCH", body: { title } });
      patchList((list) =>
        list.map((d) => (d.id === id ? { ...d, title, updatedAt: new Date().toISOString() } : d)),
      );
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e, "Could not rename the document") });
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    const target = deleting;
    setBusy(true);
    try {
      await api(`/api/documents/${target.id}`, { method: "DELETE" });
      patchList((list) => list.filter((d) => d.id !== target.id));
      setNotice({ kind: "ok", text: `Deleted “${target.title}”.` });
      setDeleting(null);
    } catch (e) {
      setNotice({ kind: "error", text: errorMessage(e, "Could not delete the document") });
      setDeleting(null);
    }
    setBusy(false);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const ext = file.name.toLowerCase().split(".").pop();
    if (ext !== "txt" && ext !== "md") {
      setNotice({ kind: "error", text: "Unsupported file type. Please choose a .txt or .md file." });
      return;
    }
    if (file.size === 0) {
      setNotice({ kind: "error", text: "That file is empty." });
      return;
    }
    if (file.size > MAX_IMPORT_BYTES) {
      setNotice({ kind: "error", text: "That file is too large. The maximum size is 500 KB." });
      return;
    }

    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await api<{ document: { id: string; title: string } }>("/api/import", {
        method: "POST",
        formData: fd,
      });
      setScope("mine");
      setSearch("");
      setReload((n) => n + 1);
      setNotice({
        kind: "ok",
        text: `Imported “${r.document.title}” as a new document.`,
        href: `/docs/${r.document.id}`,
      });
    } catch (err) {
      setNotice({ kind: "error", text: errorMessage(err, "Import failed") });
    }
    setBusy(false);
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } finally {
      router.push("/login");
      router.refresh();
    }
  }

  const emptyText = query
    ? `No documents match “${query}”.`
    : scope === "mine"
      ? "You have no documents yet. Create one, or import a .txt or .md file."
      : "Nothing has been shared with you yet.";

  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <span className="font-serif text-xl font-semibold tracking-tight">Docraft</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">
              Signed in as <span className="font-medium text-ink">{displayName(user.name)}</span>
            </span>
            <button
              type="button"
              onClick={logout}
              className="rounded-md border border-line px-3 py-1.5 hover:bg-canvas"
            >
              Switch user
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-3xl font-semibold tracking-tight">Documents</h1>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-medium hover:bg-canvas disabled:opacity-60"
            >
              Import file
            </button>
            <button
              type="button"
              onClick={createDoc}
              disabled={busy}
              className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              New document
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              className="hidden"
              onChange={onFile}
              aria-label="Import a .txt or .md file"
            />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted">Import supports .txt and .md files up to 500 KB.</p>

        {notice && (
          <div
            role={notice.kind === "error" ? "alert" : "status"}
            className={`mt-4 flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm ${
              notice.kind === "error" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent"
            }`}
          >
            <span>{notice.text}</span>
            <span className="flex items-center gap-3">
              {notice.href && (
                <Link href={notice.href} className="font-medium underline">
                  Open
                </Link>
              )}
              <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss message">
                ✕
              </button>
            </span>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <div role="tablist" aria-label="Document lists" className="flex gap-1 rounded-md bg-stone-200/60 p-1">
            {(["mine", "shared"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={scope === s}
                onClick={() => setScope(s)}
                className={`rounded px-3 py-1.5 text-sm font-medium ${
                  scope === s ? "bg-surface shadow-sm" : "text-muted hover:text-ink"
                }`}
              >
                {s === "mine" ? "My documents" : "Shared with me"}
              </button>
            ))}
          </div>
          <div className="w-full sm:w-64">
            <label htmlFor="search" className="sr-only">
              Search documents by title
            </label>
            <input
              id="search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title"
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4" aria-live="polite">
          {loading && (
            <ul aria-label="Loading documents" className="animate-pulse">
              {[0, 1, 2].map((i) => (
                <li key={i} className="border-b border-line py-5">
                  <div className="h-4 w-1/2 rounded bg-stone-200" />
                  <div className="mt-2 h-3 w-1/3 rounded bg-stone-100" />
                </li>
              ))}
            </ul>
          )}

          {loadError && (
            <div role="alert" className="rounded-md bg-danger-soft px-4 py-3 text-sm text-danger">
              {loadError}{" "}
              <button type="button" className="font-medium underline" onClick={() => setReload((n) => n + 1)}>
                Try again
              </button>
            </div>
          )}

          {docs && docs.length === 0 && (
            <p className="rounded-md border border-dashed border-line px-4 py-10 text-center text-muted">
              {emptyText}
            </p>
          )}

          {docs && docs.length > 0 && (
            <ul>
              {docs.map((d) => (
                <li
                  key={d.id}
                  className="flex flex-col gap-2 border-b border-line py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    {renaming?.id === d.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          ignoreBlur.current = true;
                          void commitRename();
                        }}
                      >
                        <label htmlFor={`rename-${d.id}`} className="sr-only">
                          Document title
                        </label>
                        <input
                          id={`rename-${d.id}`}
                          autoFocus
                          value={renaming.value}
                          maxLength={200}
                          onChange={(e) => setRenaming({ id: d.id, value: e.target.value })}
                          onBlur={() => {
                            if (ignoreBlur.current) return;
                            ignoreBlur.current = true;
                            void commitRename();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") {
                              ignoreBlur.current = true;
                              setRenaming(null);
                            }
                          }}
                          className="w-full rounded-md border border-accent bg-surface px-2 py-1 font-serif text-lg"
                        />
                      </form>
                    ) : (
                      <Link href={`/docs/${d.id}`} className="block truncate font-serif text-lg font-medium hover:underline">
                        {d.title}
                      </Link>
                    )}
                    <p className="mt-0.5 text-sm text-muted">
                      {d.role === "owner" ? "Owned by you" : `Owned by ${displayName(d.owner.name)}`} · Updated{" "}
                      {timeAgo(d.updatedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <RoleBadge role={d.role} />
                    {d.role === "owner" && (d.sharedCount ?? 0) > 0 && (
                      <span className="text-xs text-muted">Shared with {d.sharedCount}</span>
                    )}
                    {d.role === "owner" && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            ignoreBlur.current = false;
                            setRenaming({ id: d.id, value: d.title });
                          }}
                          className="rounded px-2 py-1 text-sm text-muted hover:bg-stone-100 hover:text-ink"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleting(d)}
                          className="rounded px-2 py-1 text-sm text-danger hover:bg-danger-soft"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {deleting && (
        <Modal title="Delete document?" onClose={() => setDeleting(null)}>
          <p className="text-sm text-muted">
            “{deleting.title}” will be permanently deleted
            {(deleting.sharedCount ?? 0) > 0 ? " and removed for everyone it is shared with" : ""}. This cannot be
            undone.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleting(null)}
              className="rounded-md border border-line px-3 py-2 text-sm hover:bg-canvas"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={busy}
              className="rounded-md bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
