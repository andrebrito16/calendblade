import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/server/env";

const ALGORITHM = "aes-256-gcm";
const VERSION = "v1";

function keyFor(version: string, base64Key = env.TOKEN_ENCRYPTION_KEY) {
  if (version !== VERSION) {
    throw new Error(`Unknown token encryption version: ${version}`);
  }
  const key = Buffer.from(base64Key, "base64");
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes");
  return key;
}

/**
 * Encrypts a provider token with AES-256-GCM.
 * Output format: `v1:<iv>:<ciphertext>:<tag>` (base64url parts). The version
 * prefix allows key rotation via a re-encrypt script.
 */
export function encryptToken(plaintext: string, base64Key?: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyFor(VERSION, base64Key), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64url"),
    ciphertext.toString("base64url"),
    tag.toString("base64url"),
  ].join(":");
}

export function decryptToken(payload: string, base64Key?: string): string {
  const [version, iv, ciphertext, tag] = payload.split(":");
  if (!version || !iv || ciphertext === undefined || !tag) {
    throw new Error("Malformed encrypted token");
  }
  const decipher = createDecipheriv(ALGORITHM, keyFor(version, base64Key), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString(
    "utf8",
  );
}
