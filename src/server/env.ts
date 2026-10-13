import "server-only";
import { z } from "zod";

/**
 * Server environment, validated once at boot. Optional integrations (Stripe,
 * Resend, Sentry, PostHog, Google) may be absent: the modules wrapping them
 * no-op or hide their UI, so a self-hosted instance runs with the minimum.
 *
 * Set SKIP_ENV_VALIDATION=1 for builds that run without secrets (CI, Docker).
 */
const bool = (fallback: boolean) =>
  z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((value) => (value === undefined ? fallback : value === "true" || value === "1"));

const optional = z
  .string()
  .optional()
  .transform((value) => (value ? value : undefined));

const baseSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  DATABASE_URL_UNPOOLED: optional,
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine(
      (value) => Buffer.from(value, "base64").length === 32,
      "TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded",
    ),
  CONNECTION_STATE_SECRET: z.string().min(32),
  WEBHOOK_SECRET: z.string().min(32),
  CRON_SECRET: z.string().min(16),
  CRON_BUDGET_MS: z.coerce.number().int().positive().default(50_000),
  BILLING_ENABLED: bool(false),
  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_PRO_MONTHLY: optional,
  STRIPE_PRICE_MAX_MONTHLY: optional,
  EMAIL_TRANSPORT: z.enum(["resend", "smtp", "log"]).default("log"),
  RESEND_API_KEY: optional,
  SMTP_URL: optional,
  EMAIL_FROM: z.string().default("Calendblade <hello@localhost>"),
  SENTRY_DSN: optional,
  POSTHOG_KEY: optional,
  POSTHOG_HOST: z.string().url().default("https://us.i.posthog.com"),
  PUBLIC_LOCALES: z.string().default("en"),
  PROVIDER_FIXTURE: bool(false),
  DEV_MAGIC_LINK_ENDPOINT: bool(false),
});

const schema = baseSchema.superRefine((value, ctx) => {
  if (value.BILLING_ENABLED) {
    for (const key of [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "STRIPE_PRICE_PRO_MONTHLY",
      "STRIPE_PRICE_MAX_MONTHLY",
    ] as const) {
      if (!value[key]) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when BILLING_ENABLED=true`,
        });
      }
    }
    // Checkout takes a price id; a product id (prod_…) only fails once a user clicks "subscribe".
    for (const key of ["STRIPE_PRICE_PRO_MONTHLY", "STRIPE_PRICE_MAX_MONTHLY"] as const) {
      const price = value[key];
      if (price && !price.startsWith("price_")) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${key} must be a Stripe price id (price_…), not "${price.split("_")[0]}_…"`,
        });
      }
    }
  }
  if (value.EMAIL_TRANSPORT === "resend" && !value.RESEND_API_KEY) {
    ctx.addIssue({
      code: "custom",
      path: ["RESEND_API_KEY"],
      message: "RESEND_API_KEY is required when EMAIL_TRANSPORT=resend",
    });
  }
  if (value.EMAIL_TRANSPORT === "smtp" && !value.SMTP_URL) {
    ctx.addIssue({
      code: "custom",
      path: ["SMTP_URL"],
      message: "SMTP_URL is required when EMAIL_TRANSPORT=smtp",
    });
  }
  if (value.NODE_ENV === "production") {
    if (value.PROVIDER_FIXTURE) {
      ctx.addIssue({
        code: "custom",
        path: ["PROVIDER_FIXTURE"],
        message: "The fixture provider must never run in production",
      });
    }
    if (value.DEV_MAGIC_LINK_ENDPOINT) {
      ctx.addIssue({
        code: "custom",
        path: ["DEV_MAGIC_LINK_ENDPOINT"],
        message: "The dev magic-link endpoint must never run in production",
      });
    }
    if (value.EMAIL_TRANSPORT === "log") {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_TRANSPORT"],
        message: "EMAIL_TRANSPORT=log is for development only",
      });
    }
  }
});

export type Env = z.infer<typeof schema>;

/** Inert values for builds without secrets; nothing connects at import time. */
const buildPlaceholders: Record<string, string> = {
  DATABASE_URL: "postgres://build:build@127.0.0.1:5432/build",
  BETTER_AUTH_SECRET: "build-placeholder-secret-not-used-at-runtime",
  BETTER_AUTH_URL: "http://localhost:3000",
  TOKEN_ENCRYPTION_KEY: Buffer.alloc(32).toString("base64"),
  CONNECTION_STATE_SECRET: "build-placeholder-secret-not-used-at-runtime",
  WEBHOOK_SECRET: "build-placeholder-secret-not-used-at-runtime",
  CRON_SECRET: "build-placeholder-secret",
};

function parseEnv(): Env {
  if (process.env.SKIP_ENV_VALIDATION === "1") {
    // Placeholders only while `next build` runs, never at runtime.
    const building = process.env.NEXT_PHASE === "phase-production-build";
    const merged = { ...(building ? buildPlaceholders : {}), ...process.env };
    // Defaults and coercion still apply; cross-field production checks don't.
    return baseSchema.safeParse(merged).data ?? (merged as never);
  }
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return result.data;
}

export const env = parseEnv();

export const isGoogleConfigured = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

export const publicLocales = env.PUBLIC_LOCALES.split(",")
  .map((locale) => locale.trim())
  .filter(Boolean);
