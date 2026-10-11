/** Small fetch wrapper + display helpers used by client components. */

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: Record<string, unknown>,
  ) {
    super(message);
  }
}

type Options = {
  method?: string;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
};

export async function api<T = unknown>(path: string, options: Options = {}): Promise<T> {
  const init: RequestInit = {
    method: options.method ?? "GET",
    credentials: "same-origin",
    signal: options.signal,
  };
  if (options.formData) {
    init.body = options.formData;
  } else if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
    init.headers = { "Content-Type": "application/json" };
  }

  const res = await fetch(path, init);
  if (res.status === 204) return undefined as T;

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const message = typeof data.error === "string" ? data.error : `Request failed (${res.status})`;
    throw new HttpError(res.status, message, data);
  }
  return data as T;
}

export function errorMessage(e: unknown, fallback = "Something went wrong"): string {
  if (e instanceof HttpError) return e.message;
  if (e instanceof TypeError) return "Could not reach the server. Check your connection.";
  return e instanceof Error ? e.message : fallback;
}

export function displayName(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
