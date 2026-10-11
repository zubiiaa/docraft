import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { UserModel } from "@/lib/models/User";
import { createSession } from "@/lib/auth/session";
import { ApiError, handleError, parseBody } from "@/lib/api";
import { loginSchema } from "@/lib/validation/schemas";

export async function POST(req: Request) {
  try {
    const { userId } = await parseBody(req, loginSchema);
    await connectDB();
    const user = await UserModel.findById(userId).lean();
    if (!user) throw new ApiError(404, "Unknown user");
    await createSession(String(user._id));
    return NextResponse.json({ user: { id: String(user._id), name: user.name, email: user.email } });
  } catch (err) {
    return handleError(err);
  }
}
