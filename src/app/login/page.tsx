import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <h1 className="font-serif text-4xl font-semibold tracking-tight">Docraft</h1>
      <p className="mt-2 text-muted">A focused place to write, share and keep documents.</p>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-muted">
        Choose a demo user
      </h2>
      <div className="mt-3">
        <LoginForm />
      </div>
      <p className="mt-6 text-xs text-muted">
        Demo login: no password. Each user has separate documents, so you can try sharing between them.
      </p>
    </main>
  );
}
