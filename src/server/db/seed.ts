/**
 * Development seed: a user with two demo (fixture) accounts, two rules and
 * an initial sync, so the UI can be explored without Google credentials.
 *
 *   bun run db:seed            # requires PROVIDER_FIXTURE=1
 *
 * Sign in afterwards with the seeded email via magic link (the dev endpoint
 * or Mailpit shows the link).
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

const SEED_EMAIL = process.env.SEED_EMAIL ?? "dev@example.com";

async function main() {
  const { and, eq } = await import("drizzle-orm");
  const { db } = await import("./index");
  const { calendar, calendarConnection, syncRule, user } = await import("./schema");
  const { env } = await import("../env");
  const { encryptToken } = await import("../crypto/tokens");
  const { upsertCalendars } = await import("../connections/calendars");
  const { connectionCtx } = await import("../connections/context");
  const { fixtureProvider } = await import("../providers/fixture/adapter");
  const { syncSourceCalendar } = await import("../sync/run");

  if (!env.PROVIDER_FIXTURE) throw new Error("Seeding needs PROVIDER_FIXTURE=1 (demo calendars).");

  const existing = await db.query.user.findFirst({ where: eq(user.email, SEED_EMAIL) });
  if (existing) {
    console.log(`Seed user ${SEED_EMAIL} already exists; nothing to do.`);
    return;
  }

  const [owner] = await db
    .insert(user)
    .values({
      name: "Dev User",
      email: SEED_EMAIL,
      emailVerified: true,
      timezone: "UTC",
      onboardingCompletedAt: new Date(),
    })
    .returning();
  if (!owner) throw new Error("Could not create the seed user");

  const ownerId = owner.id;
  async function connect(accountId: string) {
    const tokens = await fixtureProvider.exchangeCode(accountId, "seed");
    const [connection] = await db
      .insert(calendarConnection)
      .values({
        userId: ownerId,
        provider: "fixture",
        providerAccountId: tokens.account.id,
        email: tokens.account.email,
        displayName: tokens.account.name,
        accessTokenEnc: encryptToken(tokens.accessToken),
        refreshTokenEnc: encryptToken(tokens.refreshToken ?? ""),
        accessTokenExpiresAt: tokens.expiresAt,
        scopes: tokens.scopes,
      })
      .returning();
    if (!connection) throw new Error(`Could not connect ${accountId}`);
    await upsertCalendars(connection.id, await fixtureProvider.listCalendars(connectionCtx(connection)));
    return connection;
  }

  const calendarIdOf = async (connectionId: string, providerCalendarId: string) => {
    const row = await db.query.calendar.findFirst({
      where: and(
        eq(calendar.connectionId, connectionId),
        eq(calendar.providerCalendarId, providerCalendarId),
      ),
    });
    if (!row) throw new Error(`Calendar ${providerCalendarId} not found`);
    return row.id;
  };

  const work = await connect("fixture-work");
  const personal = await connect("fixture-personal");
  const workCal = await calendarIdOf(work.id, "alex@work.example.com");
  const personalCal = await calendarIdOf(personal.id, "alex.rivera@example.com");

  await db.insert(syncRule).values([
    { userId: owner.id, sourceCalendarId: workCal, targetCalendarId: personalCal, mode: "busy" },
    {
      userId: owner.id,
      sourceCalendarId: personalCal,
      targetCalendarId: workCal,
      mode: "full",
      titlePrefix: "[Personal]",
    },
  ]);

  await syncSourceCalendar(workCal, { trigger: "initial" });
  await syncSourceCalendar(personalCal, { trigger: "initial" });

  console.log(`Seeded ${SEED_EMAIL} with 2 demo accounts and 2 rules.`);
  console.log("Note: demo calendars live in memory; they re-seed when the dev server restarts.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
