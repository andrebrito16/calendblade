import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import { decryptToken, encryptToken } from "@/server/crypto/tokens";
import { db } from "@/server/db";
import { calendarConnection } from "@/server/db/schema";
import { isProviderError } from "@/server/providers/errors";
import { getProvider } from "@/server/providers/registry";
import type { ConnectionCtx } from "@/server/providers/types";
import { markConnectionNeedsReauth } from "./reauth";

export type ConnectionRow = typeof calendarConnection.$inferSelect;

const REFRESH_MARGIN_MS = 2 * 60 * 1000;

/**
 * Wraps a connection row with a token getter that refreshes transparently.
 * Concurrent refreshes are serialized with an optimistic check on the expiry
 * we saw: the loser re-reads the winner's token instead of refreshing again.
 */
export function connectionCtx(initial: ConnectionRow): ConnectionCtx {
  let row = initial;
  const provider = getProvider(row.provider);

  async function refresh(): Promise<string> {
    if (!row.refreshTokenEnc) {
      await markConnectionNeedsReauth(row.id, "no_refresh_token");
      throw new Error("Connection has no refresh token");
    }
    let tokens: Awaited<ReturnType<typeof provider.refreshAccessToken>>;
    try {
      tokens = await provider.refreshAccessToken(decryptToken(row.refreshTokenEnc));
    } catch (error) {
      if (isProviderError(error, "TOKEN_REVOKED")) {
        await markConnectionNeedsReauth(row.id, "token_revoked");
      }
      throw error;
    }
    const seenExpiry = row.accessTokenExpiresAt;
    const [updated] = await db
      .update(calendarConnection)
      .set({
        accessTokenEnc: encryptToken(tokens.accessToken),
        accessTokenExpiresAt: tokens.expiresAt,
        ...(tokens.refreshToken ? { refreshTokenEnc: encryptToken(tokens.refreshToken) } : {}),
      })
      .where(
        and(
          eq(calendarConnection.id, row.id),
          seenExpiry
            ? eq(calendarConnection.accessTokenExpiresAt, seenExpiry)
            : isNull(calendarConnection.accessTokenExpiresAt),
        ),
      )
      .returning();
    if (updated) {
      row = updated;
      return tokens.accessToken;
    }
    // Another worker refreshed first: use its token.
    const latest = await db.query.calendarConnection.findFirst({
      where: or(eq(calendarConnection.id, row.id)),
    });
    if (!latest?.accessTokenEnc) throw new Error("Connection disappeared during refresh");
    row = latest;
    return decryptToken(latest.accessTokenEnc);
  }

  return {
    connectionId: row.id,
    providerAccountId: row.providerAccountId,
    async getAccessToken(opts) {
      const expiresAt = row.accessTokenExpiresAt?.getTime() ?? 0;
      if (opts?.forceRefresh || !row.accessTokenEnc || expiresAt - Date.now() < REFRESH_MARGIN_MS) {
        return refresh();
      }
      return decryptToken(row.accessTokenEnc);
    },
  };
}

export async function loadConnectionCtx(connectionId: string) {
  const row = await db.query.calendarConnection.findFirst({
    where: eq(calendarConnection.id, connectionId),
  });
  return row ? { row, ctx: connectionCtx(row) } : null;
}
