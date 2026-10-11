import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 text-center">
      <h1 className="font-serif text-2xl font-semibold">Document not found</h1>
      <p className="mt-2 text-muted">
        It may have been deleted, or you may not have access to it.
      </p>
      <Link
        href="/"
        className="mx-auto mt-6 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
      >
        Back to documents
      </Link>
    </main>
  );
}
