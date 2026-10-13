import "server-only";
import { eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { tags } from "@/server/cache";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { auth } from "./auth";

/** The narrow user shape shared with Server and Client Components. */
export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  timezone: string;
  locale: string;
  emailNotifications: boolean;
  onboardingCompletedAt: Date | null;
  pausedAt: Date | null;
};

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/** Profile fields come from the DB (tagged) so settings changes show at once. */
async function getUserProfile(userId: string): Promise<CurrentUser | null> {
  "use cache";
  cacheTag(tags.user(userId));
  cacheLife("hours");
  const row = await db.query.user.findFirst({ where: eq(user.id, userId) });
  if (!row || row.deletedAt) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    image: row.image,
    timezone: row.timezone,
    locale: row.locale,
    emailNotifications: row.emailNotifications,
    onboardingCompletedAt: row.onboardingCompletedAt,
    pausedAt: row.pausedAt,
  };
}

async function readSessionUserId(requestHeaders: Headers) {
  const session = await auth.api.getSession({ headers: requestHeaders });
  return session?.user.id ?? null;
}

/**
 * The only place the session is read for rendering. Private-cached: lives in
 * the browser's per-session cache, never on the server. Redirects to sign-in
 * when signed out.
 */
export async function getCurrentUser(): Promise<CurrentUser> {
  "use cache: private";
  cacheLife({ stale: 60 });
  const userId = await readSessionUserId(await headers());
  const profile = userId ? await getUserProfile(userId) : null;
  if (!profile) redirect("/sign-in");
  return profile;
}

/** Same as getCurrentUser without redirecting (marketing "Go to app"). */
export async function getOptionalUser(): Promise<CurrentUser | null> {
  "use cache: private";
  cacheLife({ stale: 60 });
  const userId = await readSessionUserId(await headers());
  return userId ? getUserProfile(userId) : null;
}

/** For Server Actions and route handlers: always fresh, throws when signed out. */
export async function requireUser(): Promise<CurrentUser> {
  const userId = await readSessionUserId(await headers());
  const profile = userId ? await getUserProfile(userId) : null;
  if (!profile) throw new UnauthorizedError();
  return profile;
}
