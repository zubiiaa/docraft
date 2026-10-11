import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { UserModel } from "@/lib/models/User";
import { handleError } from "@/lib/api";

export async function GET() {
  try {
    await connectDB();
    const users = await UserModel.find().select("name").sort({ name: 1 }).lean();
    return NextResponse.json({
      users: users.map((u) => ({ id: String(u._id), name: u.name })),
    });
  } catch (err) {
    return handleError(err);
  }
}
