import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Creates (if needed) and migrates the test database once per run.
 * Requires the docker-compose Postgres (or TEST_DATABASE_URL).
 */
export default async function setup() {
  const url =
    process.env.TEST_DATABASE_URL ?? "postgres://calendblade:calendblade@localhost:5433/calendblade_test";
  const target = new URL(url);
  const database = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";

  const adminClient = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  const exists = await adminClient`select 1 from pg_database where datname = ${database}`;
  if (exists.length === 0) await adminClient.unsafe(`create database "${database}"`);
  await adminClient.end();

  const client = postgres(url, { max: 1, onnotice: () => {} });
  await client.unsafe(
    "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;",
  );
  await migrate(drizzle({ client }), { migrationsFolder: "./drizzle" });
  await client.end();
}
