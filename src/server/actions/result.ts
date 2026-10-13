import "server-only";
import { z } from "zod";
import type { ActionErrorCode, ActionResult } from "@/lib/action-result";
import { UnauthorizedError } from "@/server/auth/session";
import { EntitlementError } from "@/server/billing/entitlements";
import { log } from "@/server/log";

export class ActionError extends Error {
  constructor(readonly code: ActionErrorCode) {
    super(code);
  }
}

/**
 * Runs a Server Action body and converts known failures into a typed result.
 * User-facing errors never cross the boundary as exceptions.
 */
export async function runAction<T>(body: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await body() };
  } catch (error) {
    if (error instanceof UnauthorizedError) return fail("unauthorized");
    if (error instanceof ActionError) return fail(error.code);
    if (error instanceof EntitlementError) {
      const code: ActionErrorCode =
        error.code === "calendar_limit"
          ? "calendar_limit"
          : error.code === "rule_limit"
            ? "rule_limit"
            : error.code === "paused"
              ? "paused"
              : "no_subscription";
      return fail(code);
    }
    if (error instanceof z.ZodError) {
      const fieldErrors: Record<string, string[]> = {};
      for (const issue of error.issues) {
        const key = issue.path.join(".") || "_";
        fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
      }
      return { ok: false, error: { code: "validation", fieldErrors } };
    }
    // Next.js control flow (redirect/notFound) must propagate.
    if (error instanceof Error && "digest" in error) throw error;
    log.error("action.failed", { error: error instanceof Error ? error.stack : String(error) });
    return fail("unknown");
  }
}

function fail(code: ActionErrorCode): ActionResult<never> {
  return { ok: false, error: { code } };
}
