import { randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";
import { publicEnv } from "@/lib/env.public";
import { requireUser } from "@/server/auth/session";
import { assertCanAddCalendar, EntitlementError } from "@/server/billing/entitlements";
import { NONCE_COOKIE, safeReturnTo, signConnectState } from "@/server/connections/state";
import { db } from "@/server/db";
import { calendarConnection } from "@/server/db/schema";
import { env } from "@/server/env";
import { fixtureAccounts } from "@/server/providers/fixture/scenarios";
import { availableProviders, getProvider } from "@/server/providers/registry";
import type { ProviderId } from "@/server/providers/types";

function redirectTo(path: string) {
  return NextResponse.redirect(new URL(path, publicEnv.appUrl));
}

/** Begins the calendar connection OAuth flow (separate from sign-in). */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/connections/[provider]/start">) {
  const { provider: providerParam } = await ctx.params;
  const providerId = providerParam as ProviderId;
  if (!availableProviders().includes(providerId)) {
    return NextResponse.json({ error: "provider_unavailable" }, { status: 404 });
  }

  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return redirectTo(`/sign-in?next=${encodeURIComponent("/connections")}`);
  }

  const params = request.nextUrl.searchParams;
  const returnTo = safeReturnTo(params.get("returnTo"));
  const reconnectId = params.get("reconnect");
  const reconnecting = reconnectId
    ? await db.query.calendarConnection.findFirst({
        where: and(eq(calendarConnection.id, reconnectId), eq(calendarConnection.userId, user.id)),
      })
    : undefined;

  if (!reconnecting) {
    try {
      await assertCanAddCalendar(user.id);
    } catch (error) {
      if (error instanceof EntitlementError) {
        if (error.code === "no_subscription") return redirectTo("/onboarding?step=2");
        if (error.code === "calendar_limit") return redirectTo("/settings/billing?reason=calendar_limit");
        return redirectTo("/settings/billing");
      }
      throw error;
    }
  }

  let loginHint = reconnecting?.email;
  if (providerId === "fixture") {
    // Demo accounts: reconnect the same one, or pick the next unused.
    if (reconnecting) loginHint = reconnecting.providerAccountId;
    else {
      const used = await db
        .select({ id: calendarConnection.providerAccountId })
        .from(calendarConnection)
        .where(and(eq(calendarConnection.userId, user.id), eq(calendarConnection.provider, "fixture")));
      const next = fixtureAccounts.find((account) => !used.some((row) => row.id === account.id));
      if (!next) return redirectTo("/connections?error=no_demo_accounts");
      loginHint = next.id;
    }
  }

  const nonce = randomBytes(16).toString("base64url");
  const state = await signConnectState({
    userId: user.id,
    nonce,
    provider: providerId,
    returnTo,
    reconnectId: reconnecting?.id ?? null,
  });
  const redirectUri = `${publicEnv.appUrl}/api/connections/${providerId}/callback`;
  const response = NextResponse.redirect(
    getProvider(providerId).buildAuthUrl(state, { redirectUri, loginHint }),
  );
  response.cookies.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/connections",
    maxAge: 600,
  });
  return response;
}
