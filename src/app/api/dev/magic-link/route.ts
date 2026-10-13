import { type NextRequest, NextResponse } from "next/server";
import { lastMagicLink } from "@/server/auth/dev-magic-links";
import { env } from "@/server/env";

/** Development/E2E only: the last magic link sent to an email. */
export async function GET(request: NextRequest) {
  if (!env.DEV_MAGIC_LINK_ENDPOINT) return new NextResponse(null, { status: 404 });
  const email = request.nextUrl.searchParams.get("email") ?? "";
  const url = lastMagicLink(email);
  if (!url) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ url }, { headers: { "cache-control": "no-store" } });
}
