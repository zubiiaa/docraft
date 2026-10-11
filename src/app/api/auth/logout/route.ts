import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";
import { handleError } from "@/lib/api";

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}
