/**
 * Applies SQL migrations from ./drizzle. Run with `bun run db:migrate`.
 * Uses the unpooled URL when present (required by Neon for DDL).
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const client = postgres(url, { max: 1 });
await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
await client.end();
console.log("Migrations applied");
