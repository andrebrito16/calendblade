/**
 * Creates .env.local from .env.example with freshly generated secrets.
 *   bun run setup:env
 * Never overwrites an existing .env.local.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const target = ".env.local";
if (existsSync(target)) {
  console.log(`${target} already exists; leaving it untouched.`);
  process.exit(0);
}

const generated: Record<string, () => string> = {
  BETTER_AUTH_SECRET: () => randomBytes(48).toString("base64"),
  TOKEN_ENCRYPTION_KEY: () => randomBytes(32).toString("base64"),
  CONNECTION_STATE_SECRET: () => randomBytes(48).toString("base64"),
  WEBHOOK_SECRET: () => randomBytes(48).toString("base64"),
  CRON_SECRET: () => randomBytes(24).toString("hex"),
};

const output = readFileSync(".env.example", "utf8")
  .split("\n")
  .map((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    const key = match?.[1];
    if (!key || !generated[key]) return line;
    return `${key}=${generated[key]()}`;
  })
  .join("\n");

writeFileSync(target, output, { mode: 0o600 });
console.log(`Wrote ${target} with generated secrets.`);
