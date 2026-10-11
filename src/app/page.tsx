import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import Workspace from "@/components/Workspace";

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <Workspace user={{ id: user.id, name: user.name }} />;
}
