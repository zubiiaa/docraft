/**
 * Seeds the three demo users. Safe to run repeatedly (upsert by email).
 * Usage: npm run seed   (reads MONGODB_URI from .env.local)
 */
import { config } from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { UserModel } from "../src/lib/models/User";

config({ path: ".env.local" });

const DEMO_USERS = [
  { name: "zubia", email: "zubia@docraft.demo" },
  { name: "ashraf", email: "ashraf@docraft.demo" },
  { name: "syeda", email: "syeda@docraft.demo" },
];

async function main() {
  await connectDB();
  for (const u of DEMO_USERS) {
    await UserModel.updateOne({ email: u.email }, { $setOnInsert: u }, { upsert: true });
  }
  const users = await UserModel.find().sort({ name: 1 }).lean();
  console.log("Demo users:");
  for (const u of users) console.log(` - ${u.name} <${u.email}> (${String(u._id)})`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
