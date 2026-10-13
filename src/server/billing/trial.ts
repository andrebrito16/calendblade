import "server-only";
import { eq, lt } from "drizzle-orm";
import { sha256 } from "@/server/crypto/hmac";
import { db } from "@/server/db";
import { trialUsedEmail } from "@/server/db/schema";

const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

function emailHash(email: string) {
  return sha256(`trial:${email.trim().toLowerCase()}`);
}

/** Remembers (hashed) that an email used a trial, surviving account deletion. */
export async function recordTrialUsed(email: string) {
  await db
    .insert(trialUsedEmail)
    .values({ emailHash: emailHash(email) })
    .onConflictDoNothing();
}

export async function trialAlreadyUsed(email: string) {
  const row = await db.query.trialUsedEmail.findFirst({
    where: eq(trialUsedEmail.emailHash, emailHash(email)),
  });
  return Boolean(row);
}

export async function pruneTrialHashes() {
  const rows = await db
    .delete(trialUsedEmail)
    .where(lt(trialUsedEmail.usedAt, new Date(Date.now() - RETENTION_MS)))
    .returning({ hash: trialUsedEmail.emailHash });
  return rows.length;
}
