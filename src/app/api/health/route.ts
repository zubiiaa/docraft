import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";

// Always run on request; never cache a health check.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const conn = await connectDB();
    const db = conn.connection.db;
    if (!db) {
      throw new Error("Connected but database handle is unavailable");
    }
    await db.command({ ping: 1 });
    return NextResponse.json({ ok: true, database: "connected" });
  } catch (err) {
    // Log details server-side only; never leak the URI or driver errors.
    console.error("[health] database check failed:", err);
    return NextResponse.json(
      { ok: false, database: "unavailable" },
      { status: 503 },
    );
  }
}
