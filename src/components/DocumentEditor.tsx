"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import ShareDialog from "@/components/ShareDialog";
import { api, displayName, errorMessage, HttpError } from "@/lib/client";
import type { DocDto, ShareRow } from "@/lib/types";

type SaveStatus = "saved" | "unsaved" | "saving" | "error" | "conflict";

const DEBOUNCE_MS = 800;
const RETRY_MS = 5000;

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  return (n.content ?? []).map(extractText).join(" ");
}

function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

function ToolbarButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 min-w-8 items-center justify-center rounded px-2 text-sm transition disabled:opacity-40 ${
        active ? "bg-accent text-white" : "hover:bg-stone-100"
      }`}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor, disabled }: { editor: Editor | null; disabled: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      underline: e?.isActive("underline") ?? false,
      h1: e?.isActive("heading", { level: 1 }) ?? false,
      h2: e?.isActive("heading", { level: 2 }) ?? false,
      h3: e?.isActive("heading", { level: 3 }) ?? false,
      bullet: e?.isActive("bulletList") ?? false,
      ordered: e?.isActive("orderedList") ?? false,
    }),
  });
  const off = disabled || !editor;
  const chain = () => editor!.chain().focus();

  return (
    <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-1">
      <ToolbarButton label="Bold" active={!!s?.bold} disabled={off} onClick={() => chain().toggleBold().run()}>
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton label="Italic" active={!!s?.italic} disabled={off} onClick={() => chain().toggleItalic().run()}>
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        active={!!s?.underline}
        disabled={off}
        onClick={() => chain().toggleUnderline().run()}
      >
        <span className="underline">U</span>
      </ToolbarButton>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
      <ToolbarButton
        label="Heading 1"
        active={!!s?.h1}
        disabled={off}
        onClick={() => chain().toggleHeading({ level: 1 }).run()}
      >
        H1
      </ToolbarButton>
      <ToolbarButton
        label="Heading 2"
        active={!!s?.h2}
        disabled={off}
        onClick={() => chain().toggleHeading({ level: 2 }).run()}
      >
        H2
      </ToolbarButton>
      <ToolbarButton
        label="Heading 3"
        active={!!s?.h3}
        disabled={off}
        onClick={() => chain().toggleHeading({ level: 3 }).run()}
      >
        H3
      </ToolbarButton>
      <span aria-hidden="true" className="mx-1 h-5 w-px bg-line" />
      <ToolbarButton
        label="Bulleted list"
        active={!!s?.bullet}
        disabled={off}
        onClick={() => chain().toggleBulletList().run()}
      >
        • List
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={!!s?.ordered}
        disabled={off}
        onClick={() => chain().toggleOrderedList().run()}
      >
        1. List
      </ToolbarButton>
    </div>
  );
}

export default function DocumentEditor({ initial }: { initial: DocDto }) {
  const router = useRouter();
  const canEdit = initial.role === "owner" || initial.role === "editor";
  const isOwner = initial.role === "owner";

  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [errorText, setErrorText] = useState("");
  const [words, setWords] = useState(() => countWords(extractText(initial.content)));
  const [shares, setShares] = useState<ShareRow[]>(initial.shares ?? []);
  const [shareOpen, setShareOpen] = useState(false);
  const [titleMsg, setTitleMsg] = useState("");

  // Autosave bookkeeping lives in refs: it must not trigger re-renders.
  const versionRef = useRef(initial.version); // last version the server confirmed
  const dirtyRef = useRef(false); // edits exist that the server has not confirmed
  const inFlightRef = useRef(false); // at most ONE save request at a time
  const conflictRef = useRef(false); // server said our base version is stale
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTitleRef = useRef(initial.title);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    setStatus("unsaved");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => void flushRef.current(), DEBOUNCE_MS);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Only the formatting this product supports; everything else is disabled
        // so pasted content cannot introduce unsupported structure.
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: false,
      }),
    ],
    content: initial.content as JSONContent,
    editable: canEdit,
    immediatelyRender: false, // avoid SSR hydration mismatch in Next.js
    editorProps: {
      attributes: { class: "docraft-prose", "aria-label": "Document body" },
    },
    onUpdate: ({ editor: e }) => {
      setWords(countWords(e.getText({ blockSeparator: " " })));
      if (!conflictRef.current) scheduleSave();
    },
  });

  // The save routine. Re-assigned each render so it always sees the latest editor.
  useEffect(() => {
    flushRef.current = async () => {
      if (!editor || !canEdit || conflictRef.current) return;
      if (inFlightRef.current || !dirtyRef.current) return; // queued edits are picked up after the current save
      inFlightRef.current = true;
      dirtyRef.current = false; // edits made while this request runs set it true again
      setStatus("saving");
      const content = editor.getJSON();
      try {
        const r = await api<{ document: { version: number } }>(`/api/documents/${initial.id}`, {
          method: "PATCH",
          body: { content, baseVersion: versionRef.current },
        });
        versionRef.current = r.document.version;
        inFlightRef.current = false;
        if (dirtyRef.current) void flushRef.current();
        else setStatus("saved");
      } catch (e) {
        inFlightRef.current = false;
        dirtyRef.current = true; // still unsaved
        if (e instanceof HttpError && e.status === 409) {
          conflictRef.current = true;
          setStatus("conflict");
          return;
        }
        if (e instanceof HttpError && e.status === 401) setErrorText("Your session expired. Log in again.");
        else if (e instanceof HttpError && (e.status === 403 || e.status === 404))
          setErrorText("You no longer have edit access to this document.");
        else setErrorText(errorMessage(e, "Could not save"));
        setStatus("error");
        const retriable = !(e instanceof HttpError) || e.status >= 500;
        if (retriable) timerRef.current = setTimeout(() => void flushRef.current(), RETRY_MS);
      }
    };
  });

  // Warn before closing the tab with unsaved work; flush when the tab is hidden.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || inFlightRef.current) e.preventDefault();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flushRef.current();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!titleMsg) return;
    const t = setTimeout(() => setTitleMsg(""), 3000);
    return () => clearTimeout(t);
  }, [titleMsg]);

  async function goBack(e: React.MouseEvent) {
    e.preventDefault();
    if (dirtyRef.current || inFlightRef.current) {
      if (timerRef.current) clearTimeout(timerRef.current);
      await flushRef.current();
      for (let i = 0; i < 50 && inFlightRef.current; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      if (dirtyRef.current && !window.confirm("Your latest changes could not be saved. Leave anyway?")) return;
      dirtyRef.current = false;
    }
    router.push("/");
  }

  async function saveTitle() {
    if (!canEdit) return;
    const t = title.trim();
    if (!t) {
      setTitle(savedTitleRef.current);
      return;
    }
    if (t === savedTitleRef.current) return;
    try {
      await api(`/api/documents/${initial.id}`, { method: "PATCH", body: { title: t } });
      savedTitleRef.current = t;
      setTitle(t);
      setTitleMsg("Renamed");
    } catch (e) {
      setTitleMsg(errorMessage(e, "Could not rename"));
    }
  }

  function exportText() {
    if (!editor) return;
    const text = editor.getText({ blockSeparator: "\n\n" });
    const blob = new Blob([text + "\n"], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.replace(/[^\w\- ]+/g, "").trim() || "document"}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function reloadLatest() {
    dirtyRef.current = false; // discard unsaved edits so the browser does not prompt
    window.location.reload();
  }

  const statusLabel =
    status === "saving"
      ? "Saving…"
      : status === "unsaved"
        ? "Unsaved changes"
        : status === "error"
          ? "Save failed"
          : status === "conflict"
            ? "Not saved"
            : "Saved";

  const roleLabel = isOwner ? "You are the owner" : canEdit ? "You can edit" : "View only";
  const sharingLabel = isOwner
    ? shares.length === 0
      ? "Private to you"
      : `Shared with ${shares.length} ${shares.length === 1 ? "person" : "people"}`
    : `Owned by ${displayName(initial.owner.name)}`;

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
          <Link href="/" onClick={goBack} className="rounded px-2 py-1 text-sm text-muted hover:bg-canvas hover:text-ink">
            ← Documents
          </Link>
          <div className="min-w-0 flex-1 basis-48">
            <label htmlFor="doc-title" className="sr-only">
              Document title
            </label>
            <input
              id="doc-title"
              value={title}
              readOnly={!canEdit}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="w-full truncate rounded border border-transparent bg-transparent px-2 py-1 font-serif text-lg font-semibold hover:border-line focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-2">
            {canEdit ? (
              <span
                role="status"
                aria-live="polite"
                className={`text-sm ${status === "error" || status === "conflict" ? "font-medium text-danger" : "text-muted"}`}
              >
                {statusLabel}
              </span>
            ) : (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">View only</span>
            )}
            {status === "error" && (
              <button
                type="button"
                onClick={() => void flushRef.current()}
                className="rounded border border-line px-2 py-1 text-sm hover:bg-canvas"
              >
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={exportText}
              className="rounded border border-line px-3 py-1.5 text-sm hover:bg-canvas"
            >
              Export .txt
            </button>
            {isOwner && (
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Share
              </button>
            )}
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-1.5">
            <Toolbar editor={editor} disabled={!canEdit} />
            <p className="text-xs text-muted">
              {roleLabel} · {sharingLabel} · {words} {words === 1 ? "word" : "words"}
              {titleMsg ? ` · ${titleMsg}` : ""}
            </p>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-4xl px-3 py-6 sm:px-4">
        {status === "error" && (
          <p role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            {errorText} Your changes are kept in this tab and we will keep retrying.
          </p>
        )}
        {status === "conflict" && (
          <div role="alert" className="mb-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
            This document was changed elsewhere, so your latest edits were not saved (this stops them from
            overwriting newer work).{" "}
            <button type="button" onClick={reloadLatest} className="font-medium underline">
              Reload the latest version
            </button>
          </div>
        )}
        {!canEdit && (
          <p className="mb-4 rounded-md bg-stone-100 px-3 py-2 text-sm text-stone-700">
            You have view-only access to this document. Ask {displayName(initial.owner.name)} for edit access.
          </p>
        )}

        <article className="min-h-[70vh] rounded-sm border border-line bg-surface px-5 py-8 shadow-sm focus-within:border-accent/40 sm:px-14 sm:py-12">
          <EditorContent editor={editor} />
        </article>
      </main>

      {shareOpen && (
        <ShareDialog
          docId={initial.id}
          ownerId={initial.owner.id}
          shares={shares}
          onChange={setShares}
          onClose={() => setShareOpen(false)}
        />
      )}
    </>
  );
}
