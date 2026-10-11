import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { connectDB } from "@/lib/db";
import { UserModel } from "@/lib/models/User";

/**
 * Server-managed session: a signed JWT in an httpOnly cookie.
 * The browser cannot forge or alter the user id without AUTH_SECRET.
 * (Demo login has no passwords; see ARCHITECTURE.md.)
 */
const COOKIE_NAME = "docraft_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(userId: string): Promise<void> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const id = payload.sub;
    if (!id || !/^[a-f\d]{24}$/i.test(id)) return null;

    await connectDB();
    const user = await UserModel.findById(id).lean();
    if (!user) return null;
    return { id: String(user._id), name: user.name, email: user.email };
  } catch {
    // Expired, tampered or malformed token.
    return null;
  }
}
