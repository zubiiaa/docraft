import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { ApiError, loadDocument } from "@/lib/api";
import { toFullDto, userNames } from "@/lib/dto";
import DocumentEditor from "@/components/DocumentEditor";
import type { DocDto } from "@/lib/types";

export default async function DocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let dto: DocDto | null = null;
  try {
    const { doc, access } = await loadDocument(id, user, "read");
    const ids = [String(doc.ownerId), ...doc.shares.map((s) => String(s.userId))];
    const names = await userNames([...new Set(ids)]);
    // Round-trip through JSON so only plain, serializable data reaches the client.
    dto = JSON.parse(JSON.stringify(toFullDto(doc, access, names))) as DocDto;
  } catch (e) {
    if (e instanceof ApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }

  if (!dto) notFound();
  return <DocumentEditor initial={dto} />;
}
