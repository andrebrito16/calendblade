"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import type { ActionResult } from "@/lib/action-result";
import { forgetAnalyticsConsent } from "@/server/analytics/posthog";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { limitAction } from "./rate-limit";
import { runAction } from "./result";

const consentSchema = z.object({ errors: z.boolean(), analytics: z.boolean() });

/**
 * Mirrors the visitor's cookie choice onto their account: proof of consent
 * (when and what) and the switch for server-side analytics. Signed-out
 * visitors only have the cookie; this returns `unauthorized` for them.
 */
export async function saveConsent(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const current = await requireUser();
    await limitAction(current.id, "consent.save", 30);
    const values = consentSchema.parse(input);
    await db
      .update(user)
      .set({
        consentErrors: values.errors,
        consentAnalytics: values.analytics,
        consentUpdatedAt: new Date(),
      })
      .where(eq(user.id, current.id));
    forgetAnalyticsConsent(current.id);
    return undefined;
  });
}
