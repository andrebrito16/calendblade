import { createHash } from "node:crypto";
import type { MirrorInput } from "../providers/types";

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stable(entry)]),
    );
  }
  return value;
}

/** Stable fingerprint of what we write, so unchanged events cost no API call. */
export function hashMirror(input: MirrorInput): string {
  return createHash("sha256")
    .update(JSON.stringify(stable(input)))
    .digest("hex");
}
