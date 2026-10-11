import { NextResponse } from "next/server";
import { handleError, requireUser } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json({ user });
  } catch (err) {
    return handleError(err);
  }
}
