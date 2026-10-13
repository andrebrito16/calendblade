import "server-only";
import { env } from "@/server/env";

/**
 * Development/E2E helper: remembers the last magic link per email so tests
 * (and the "magic link sent" page) can open it without a real inbox.
 * Disabled unless DEV_MAGIC_LINK_ENDPOINT=1, which env.ts forbids in production.
 */
const store =
  (globalThis as unknown as { __magicLinks?: Map<string, string> }).__magicLinks ?? new Map<string, string>();
(globalThis as unknown as { __magicLinks?: Map<string, string> }).__magicLinks = store;

export function rememberMagicLink(email: string, url: string) {
  if (env.DEV_MAGIC_LINK_ENDPOINT) store.set(email.toLowerCase(), url);
}

export function lastMagicLink(email: string): string | undefined {
  if (!env.DEV_MAGIC_LINK_ENDPOINT) return undefined;
  return store.get(email.toLowerCase());
}
