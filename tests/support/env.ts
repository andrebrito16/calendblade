/** Deterministic test environment (never real secrets). */
const defaults: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? "postgres://calendblade:calendblade@localhost:5433/calendblade_test",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-0000",
  BETTER_AUTH_URL: "http://localhost:3100",
  NEXT_PUBLIC_APP_URL: "http://localhost:3100",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  CONNECTION_STATE_SECRET: "test-connection-state-secret-0000000000",
  WEBHOOK_SECRET: "test-webhook-secret-00000000000000000000",
  CRON_SECRET: "test-cron-secret-0000",
  EMAIL_TRANSPORT: "log",
  PROVIDER_FIXTURE: "1",
  BILLING_ENABLED: "false",
};

for (const [key, value] of Object.entries(defaults)) {
  if (key === "DATABASE_URL" || process.env[key] === undefined) process.env[key] = value;
}
