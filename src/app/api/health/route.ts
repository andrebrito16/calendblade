import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/server/db";

/** Uptime check: database round trip plus build identity. */
export async function GET() {
  const startedAt = Date.now();
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json(
      {
        status: "ok",
        db: "ok",
        dbLatencyMs: Date.now() - startedAt,
        version: process.env.npm_package_version ?? "0.1.0",
        commit: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT ?? null,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "error", db: "unreachable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
