import "server-only";
import { connection } from "next/server";

/**
 * The current time for request-time rendering (relative times, countdowns).
 * `connection()` marks the caller as dynamic so the value is never baked
 * into a prerendered shell.
 */
export async function requestNow() {
  await connection();
  return new Date();
}
