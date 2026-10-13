import { neonConfig, Pool } from "@neondatabase/serverless";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import ws from "ws";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;

function isNeonUrl(url: string) {
  return new URL(url).hostname.endsWith(".neon.tech");
}

/**
 * Creates a Drizzle client. Neon URLs use the Neon serverless driver
 * (WebSocket pool, supports transactions); anything else is plain Postgres
 * through postgres.js, so self-hosters need nothing Neon-specific. Both
 * drivers expose the same query builder; we type against postgres.js.
 */
export function createDatabase(url: string): Database {
  if (isNeonUrl(url)) {
    neonConfig.webSocketConstructor = ws;
    const pool = new Pool({ connectionString: url });
    return drizzleNeon({
      client: pool,
      schema,
      casing: "snake_case",
    }) as unknown as Database;
  }
  const client = postgres(url, { max: 10, prepare: false });
  return drizzlePostgres({ client, schema, casing: "snake_case" });
}
