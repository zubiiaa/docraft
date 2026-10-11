"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, displayName, errorMessage } from "@/lib/client";

type DemoUser = { id: string; name: string };

export default function LoginForm() {
  const router = useRouter();
  const [users, setUsers] = useState<DemoUser[] | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");

  useEffect(() => {
    api<{ users: DemoUser[] }>("/api/users")
      .then((r) => setUsers(r.users))
      .catch(() => {
        setUsers([]);
        setError("Could not load demo users. Has the database been seeded (npm run seed)?");
      });
  }, []);

  async function login(id: string) {
    setPending(id);
    setError("");
    try {
      await api("/api/auth/login", { method: "POST", body: { userId: id } });
      router.push("/");
      router.refresh();
    } catch (e) {
      setError(errorMessage(e, "Could not log in"));
      setPending("");
    }
  }

  return (
    <div>
      {users === null && <p className="text-sm text-muted">Loading demo users…</p>}
      {users && users.length > 0 && (
        <ul className="space-y-2">
          {users.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => login(u.id)}
                disabled={pending !== ""}
                className="flex w-full items-center gap-3 rounded-md border border-line bg-surface px-4 py-3 text-left transition hover:border-accent disabled:opacity-60"
              >
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
                >
                  {displayName(u.name).charAt(0)}
                </span>
                <span className="font-medium">{displayName(u.name)}</span>
                {pending === u.id && <span className="ml-auto text-sm text-muted">Signing in…</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
