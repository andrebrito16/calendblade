import { ProviderError } from "../errors";

export const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

const RETRY_DELAYS_MS = [500, 1500, 4000];
const RATE_LIMIT_REASONS = new Set(["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"]);

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  accessToken?: string;
  query?: Record<string, string | number | boolean | undefined>;
  json?: unknown;
  form?: Record<string, string>;
  /** Injected in tests to avoid real waits. */
  sleep?: (ms: number) => Promise<void>;
};

const defaultSleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function buildUrl(url: string, query?: RequestOptions["query"]) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) target.searchParams.set(key, String(value));
  }
  return target.toString();
}

function parseRetryAfter(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

async function toProviderError(response: Response): Promise<ProviderError> {
  let reason: string | undefined;
  let message = `Google API ${response.status}`;
  let oauthError: string | undefined;
  try {
    const body = (await response.json()) as {
      error?: string | { message?: string; errors?: { reason?: string }[] };
      error_description?: string;
    };
    if (typeof body.error === "string") {
      oauthError = body.error;
      message = body.error_description ?? body.error;
    } else if (body.error) {
      message = body.error.message ?? message;
      reason = body.error.errors?.[0]?.reason;
    }
  } catch {
    // Non-JSON error body.
  }
  const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
  const status = response.status;

  if (oauthError === "invalid_grant") {
    return new ProviderError("TOKEN_REVOKED", message, status);
  }
  if (status === 429 || (status === 403 && reason && RATE_LIMIT_REASONS.has(reason))) {
    return new ProviderError("RATE_LIMITED", message, status, retryAfter);
  }
  if (status === 404) return new ProviderError("NOT_FOUND", message, status);
  if (status === 410) return new ProviderError("GONE", message, status);
  if (status === 403) return new ProviderError("FORBIDDEN", message, status);
  if (status >= 500) return new ProviderError("TRANSIENT", message, status, retryAfter);
  return new ProviderError("INVALID", message, status);
}

/**
 * Minimal typed fetch wrapper for Google REST APIs. Retries 429/5xx (and
 * rate-limit 403s) with exponential backoff, honoring Retry-After.
 */
export async function googleRequest<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const headers: Record<string, string> = { accept: "application/json" };
  if (options.accessToken) headers.authorization = `Bearer ${options.accessToken}`;
  let body: string | undefined;
  if (options.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.json);
  } else if (options.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(options.form).toString();
  }

  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await fetch(buildUrl(url, options.query), {
        method: options.method ?? "GET",
        headers,
        body,
        cache: "no-store",
      });
    } catch (error) {
      if (attempt < RETRY_DELAYS_MS.length) {
        await sleep(RETRY_DELAYS_MS[attempt] ?? 0);
        continue;
      }
      throw new ProviderError("TRANSIENT", `Network error: ${String(error)}`);
    }

    if (response.ok) {
      if (response.status === 204) return undefined as T;
      const text = await response.text();
      return (text ? JSON.parse(text) : undefined) as T;
    }

    const error = await toProviderError(response);
    if (error.retryable && attempt < RETRY_DELAYS_MS.length) {
      await sleep(Math.min(error.retryAfterMs ?? RETRY_DELAYS_MS[attempt] ?? 0, 30_000));
      continue;
    }
    throw error;
  }
}
