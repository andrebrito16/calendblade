import "server-only";
import { env } from "@/server/env";
import { createDatabase, type Database } from "./client";

const globalForDb = globalThis as unknown as { db?: Database };

/** Shared Drizzle client; reused across hot reloads in development. */
export const db: Database = globalForDb.db ?? createDatabase(env.DATABASE_URL);

if (env.NODE_ENV !== "production") globalForDb.db = db;

export * as schema from "./schema";
export type { Database };
