import { and, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { after, type NextRequest, NextResponse } from "next/server";
import { publicEnv } from "@/lib/env.public";
import { analytics } from "@/server/analytics/posthog";
import { requireUser } from "@/server/auth/session";
import { assertCanAddCalendar, EntitlementError } from "@/server/billing/entitlements";
import { tags } from "@/server/cache";
import { upsertCalendars } from "@/server/connections/calendars";
import { connectionCtx } from "@/server/connections/context";
import { resumeRulesAfterReauth } from "@/server/connections/reauth";
import { NONCE_COOKIE, verifyConnectState } from "@/server/connections/state";
import { safeEqual } from "@/server/crypto/hmac";
import { encryptToken } from "@/server/crypto/tokens";
import { db } from "@/server/db";
import { calendarConnection } from "@/server/db/schema";
import { env } from "@/server/env";
import { processJobs } from "@/server/jobs/worker";
import { log } from "@/server/log";
import { availableProviders, getProvider } from "@/server/providers/registry";
import type { ProviderId } from "@/server/providers/types";
import { scheduleSync, scheduleWatch } from "@/server/sync/schedule";

function finish(path: string) {
  const response = NextResponse.redirect(new URL(path, publicEnv.appUrl));
  response.cookies.delete({ name: NONCE_COOKIE, path: "/api/connections" });
  return response;
}

function withParam(path: string, key: string, value: string) {
  const url = new URL(path, publicEnv.appUrl);
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

/** Completes the calendar connection: verify state, store encrypted tokens, discover calendars. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/connections/[provider]/callback">) {
  const { provider: providerParam } = await ctx.params;
  const providerId = providerParam as ProviderId;
  if (!availableProviders().includes(providerId)) {
    return NextResponse.json({ error: "provider_unavailable" }, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const state = await verifyConnectState(params.get("state") ?? "");
  const nonce = request.cookies.get(NONCE_COOKIE)?.value;
  let user: Awaited<ReturnType<typeof requireUser>>;
  try {
    user = await requireUser();
  } catch {
    return finish("/sign-in");
  }
  if (
    !state ||
    !nonce ||
    !safeEqual(state.nonce, nonce) ||
    state.userId !== user.id ||
    state.provider !== providerId
  ) {
    log.warn("connection.invalid_state", { userId: user.id });
    return finish("/connections?error=invalid_state");
  }

  const fallback = state.returnTo ?? "/connections";
  const oauthError = params.get("error");
  const code = params.get("code");
  if (oauthError || !code) return finish(withParam(fallback, "error", "denied"));

  const provider = getProvider(providerId);
  const redirectUri = `${publicEnv.appUrl}/api/connections/${providerId}/callback`;
  let tokens: Awaited<ReturnType<typeof provider.exchangeCode>>;
  try {
    tokens = await provider.exchangeCode(code, redirectUri);
  } catch (error) {
    log.error("connection.exchange_failed", { error: String(error) });
    return finish(withParam(fallback, "error", "connect_failed"));
  }

  const existing = await db.query.calendarConnection.findFirst({
    where: and(
      eq(calendarConnection.userId, user.id),
      eq(calendarConnection.provider, providerId),
      eq(calendarConnection.providerAccountId, tokens.account.id),
    ),
  });

  if (!existing || existing.status === "revoked") {
    try {
      if (!existing) await assertCanAddCalendar(user.id);
    } catch (error) {
      if (error instanceof EntitlementError) {
        return finish(
          error.code === "no_subscription" ? "/onboarding?step=2" : "/settings/billing?reason=calendar_limit",
        );
      }
      throw error;
    }
  }
  if (existing?.status === "revoked") {
    // Still being torn down from a previous disconnect.
    return finish(withParam(fallback, "error", "connect_failed"));
  }
  if (!tokens.refreshToken && !existing?.refreshTokenEnc) {
    return finish(withParam(fallback, "error", "no_refresh_token"));
  }

  const values = {
    email: tokens.account.email,
    displayName: tokens.account.name ?? null,
    avatarUrl: tokens.account.avatarUrl ?? null,
    accessTokenEnc: encryptToken(tokens.accessToken),
    accessTokenExpiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
    status: "active" as const,
    lastErrorCode: null,
    lastErrorAt: null,
    reauthEmailSentAt: null,
    ...(tokens.refreshToken ? { refreshTokenEnc: encryptToken(tokens.refreshToken) } : {}),
  };

  const [connection] = existing
    ? await db
        .update(calendarConnection)
        .set(values)
        .where(eq(calendarConnection.id, existing.id))
        .returning()
    : await db
        .insert(calendarConnection)
        .values({
          userId: user.id,
          provider: providerId,
          providerAccountId: tokens.account.id,
          ...values,
        })
        .returning();
  if (!connection) return finish(withParam(fallback, "error", "connect_failed"));

  try {
    await upsertCalendars(connection.id, await provider.listCalendars(connectionCtx(connection)));
  } catch (error) {
    log.error("connection.list_calendars_failed", { error: String(error) });
  }

  if (existing) {
    const resumed = await resumeRulesAfterReauth(connection.id);
    for (const calendarId of new Set(resumed.map((rule) => rule.sourceCalendarId))) {
      await scheduleWatch(calendarId);
      await scheduleSync(calendarId, "manual");
    }
    if (resumed.length > 0) {
      after(() => processJobs({ budgetMs: Math.min(env.CRON_BUDGET_MS, 30_000) }));
    }
  } else {
    analytics.capture(user.id, "connection_created", { provider: providerId });
  }

  for (const tag of [
    tags.connections(user.id),
    tags.calendars(connection.id),
    tags.rules(user.id),
    tags.billing(user.id),
  ]) {
    revalidateTag(tag, { expire: 0 });
  }
  const destination = state.returnTo ?? `/connections/${connection.id}`;
  return finish(withParam(destination, "connected", connection.email));
}
