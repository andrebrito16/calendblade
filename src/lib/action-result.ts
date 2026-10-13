export type ActionErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "rate_limited"
  | "no_subscription"
  | "calendar_limit"
  | "rule_limit"
  | "paused"
  | "conflict"
  | "unknown";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ActionErrorCode; fieldErrors?: Record<string, string[]> } };
