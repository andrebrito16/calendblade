import { NextResponse } from "next/server";
import { requireUser } from "@/server/auth/session";
import { countPendingSyncsForUser } from "@/server/queries/runs";

/** Polled by the topbar indicator every 30 seconds. */
export async function GET() {
  try {
    const user = await requireUser();
    return NextResponse.json(
      { pending: await countPendingSyncsForUser(user.id) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
}
