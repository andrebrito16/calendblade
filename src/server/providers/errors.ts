export type ProviderErrorCode =
  | "TOKEN_REVOKED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "GONE"
  | "FORBIDDEN"
  | "INVALID"
  | "TRANSIENT";

/** Normalized provider failure. The engine decides retry vs. pause per code. */
export class ProviderError extends Error {
  constructor(
    readonly code: ProviderErrorCode,
    message: string,
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  get retryable() {
    return this.code === "RATE_LIMITED" || this.code === "TRANSIENT";
  }
}

export function isProviderError(error: unknown, code?: ProviderErrorCode): error is ProviderError {
  return error instanceof ProviderError && (code === undefined || error.code === code);
}

/** Missing resources: 404, and 410 for events already deleted. */
export function isMissing(error: unknown) {
  return isProviderError(error, "NOT_FOUND") || isProviderError(error, "GONE");
}
