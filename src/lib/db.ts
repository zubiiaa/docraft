import mongoose from "mongoose";

/**
 * Serverless-safe MongoDB connection.
 *
 * On Vercel, each function instance can be reused across requests, but
 * module state can also be re-evaluated (and in `next dev`, hot-reloaded).
 * Caching the connection promise on `globalThis` prevents opening a new
 * connection on every request, which would exhaust the Atlas free tier.
 */
type MongooseCache = {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
};

const globalWithCache = globalThis as unknown as {
  _mongooseCache?: MongooseCache;
};

const cache: MongooseCache = (globalWithCache._mongooseCache ??= {
  conn: null,
  promise: null,
});

export async function connectDB(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set");
  }

  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    cache.promise = mongoose
      .connect(uri, {
        // Fail fast instead of queueing commands while disconnected.
        bufferCommands: false,
        serverSelectionTimeoutMS: 8000,
      })
      .catch((err) => {
        // Don't cache a failed attempt, so the next request can retry.
        cache.promise = null;
        throw err;
      });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
