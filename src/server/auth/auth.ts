import "server-only";
import { stripe } from "@better-auth/stripe";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { v7 as uuidv7 } from "uuid";
import { publicEnv } from "@/lib/env.public";
import { analytics } from "@/server/analytics/posthog";
import { getStripe, stripePlans } from "@/server/billing/stripe";
import { stripeSubscriptionHooks } from "@/server/billing/stripe-hooks";
import { trialAlreadyUsed } from "@/server/billing/trial";
import { db } from "@/server/db";
import * as schema from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { env, isGoogleConfigured } from "@/server/env";
import { negotiateLocale } from "@/server/i18n/negotiate";
import { log } from "@/server/log";
import { rememberMagicLink } from "./dev-magic-links";

const billingPlugins = env.BILLING_ENABLED
  ? [
      stripe({
        stripeClient: getStripe(),
        stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET ?? "",
        createCustomerOnSignUp: true,
        subscription: {
          enabled: true,
          plans: stripePlans(),
          authorizeReference: async ({ user, referenceId }) => referenceId === user.id,
          getCheckoutSessionParams: async ({ user }) => {
            const denyTrial = await trialAlreadyUsed(user.email);
            return {
              params: {
                payment_method_collection: "always",
                allow_promotion_codes: true,
                ...(denyTrial ? { subscription_data: { trial_period_days: undefined } } : {}),
              },
            };
          },
          ...stripeSubscriptionHooks,
        },
        onEvent: stripeSubscriptionHooks.onEvent,
      }),
    ]
  : [];

export const auth = betterAuth({
  appName: "Calendblade",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.BETTER_AUTH_URL, publicEnv.appUrl],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      rateLimit: schema.rateLimit,
      subscription: schema.subscription,
    },
  }),
  advanced: {
    database: { generateId: () => uuidv7() },
  },
  user: {
    additionalFields: {
      timezone: { type: "string", required: false, defaultValue: "UTC", input: false },
      locale: { type: "string", required: false, defaultValue: "en", input: false },
    },
  },
  socialProviders: isGoogleConfigured
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID ?? "",
          clientSecret: env.GOOGLE_CLIENT_SECRET ?? "",
          prompt: "select_account",
          // Identity scopes only. Calendar access is a separate connection
          // flow (src/app/api/connections/google), never requested at login.
          scope: ["openid", "email", "profile"],
        },
      }
    : {},
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  rateLimit: {
    // Production only (Better Auth's default); dev and E2E sign in repeatedly.
    enabled: env.NODE_ENV === "production",
    storage: "database",
    customRules: {
      "/sign-in/magic-link": { window: 60, max: 5 },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // Accounts pending deletion can't start new sessions.
        before: async (session) => {
          const owner = await db.query.user.findFirst({
            where: eq(schema.user.id, session.userId),
            columns: { deletedAt: true },
          });
          return owner?.deletedAt ? false : { data: session };
        },
      },
    },
    user: {
      create: {
        before: async (user, ctx) => {
          const locale = negotiateLocale(ctx?.request?.headers.get("accept-language") ?? null);
          return { data: { ...user, locale } };
        },
        after: async (user) => {
          const created = user as typeof user & { locale?: string };
          analytics.capture(user.id, "signed_up");
          after(() =>
            sendEmail({
              to: user.email,
              template: "welcome",
              props: {
                name: user.name || user.email.split("@")[0] || user.email,
                url: `${publicEnv.appUrl}/dashboard`,
              },
              locale: created.locale,
              userId: user.id,
              idempotencyKey: `welcome:${user.id}`,
            }).catch((error) => log.error("email.welcome_failed", { error: String(error) })),
          );
        },
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 600,
      storeToken: "hashed",
      rateLimit: { window: 60, max: 5 },
      sendMagicLink: async ({ email, url }, ctx) => {
        rememberMagicLink(email, url);
        await sendEmail({
          to: email,
          template: "magic-link",
          props: { url },
          locale: negotiateLocale(ctx?.request?.headers.get("accept-language") ?? null),
        });
      },
    }),
    ...billingPlugins,
    nextCookies(), // must stay last
  ],
});

export type Auth = typeof auth;
