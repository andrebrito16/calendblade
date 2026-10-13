import "server-only";
import { NextResponse } from "next/server";
import { safeEqual } from "@/server/crypto/hmac";
import { env } from "@/server/env";
import { log } from "@/server/log";

/** Cron endpoints require `Authorization: Bearer <CRON_SECRET>`. */
export function rejectUnauthorizedCron(request: Request): NextResponse | null {
  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${env.CRON_SECRET}`;
  if (safeEqual(header, expected)) return null;
  log.warn("cron.unauthorized", { path: new URL(request.url).pathname });
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}
