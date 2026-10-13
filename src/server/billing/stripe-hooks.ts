import "server-only";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { publicEnv } from "@/lib/env.public";
import { isPlanId, plans } from "@/lib/plans";
import { analytics } from "@/server/analytics/posthog";
import { invalidateTags, tags } from "@/server/cache";
import { db } from "@/server/db";
import { user } from "@/server/db/schema";
import { sendEmail } from "@/server/email/send";
import { getServerFormatter, getServerTranslator } from "@/server/i18n/messages";
import { log } from "@/server/log";
import { pauseUser, resumeUser } from "./lifecycle";
import { recordTrialUsed } from "./trial";

type SubscriptionLike = { referenceId: string; status: string; plan: string; trialStart?: Date | null };

const ENDED_STATUSES = new Set(["canceled", "unpaid", "incomplete_expired"]);
const LIVE_STATUSES = new Set(["active", "trialing"]);

async function findUser(userId: string) {
  return db.query.user.findFirst({ where: eq(user.id, userId) });
}

async function findUserByCustomer(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null) {
  const customerId = typeof customer === "string" ? customer : customer?.id;
  if (!customerId) return undefined;
  return db.query.user.findFirst({ where: eq(user.stripeCustomerId, customerId) });
}

function planLabel(locale: string, plan: string) {
  const t = getServerTranslator(locale);
  return plan === "max" ? t("billing.planMax") : t("billing.planPro");
}

async function syncLifecycle(sub: SubscriptionLike) {
  invalidateTags(tags.billing(sub.referenceId));
  if (sub.trialStart) {
    const owner = await findUser(sub.referenceId);
    if (owner) await recordTrialUsed(owner.email);
  }
  if (ENDED_STATUSES.has(sub.status)) await pauseUser(sub.referenceId);
  else if (LIVE_STATUSES.has(sub.status)) await resumeUser(sub.referenceId);
}

async function sendConfirmed(sub: SubscriptionLike) {
  const owner = await findUser(sub.referenceId);
  if (!owner || !isPlanId(sub.plan)) return;
  await sendEmail({
    to: owner.email,
    template: "subscription-confirmed",
    props: { plan: planLabel(owner.locale, sub.plan), url: `${publicEnv.appUrl}/dashboard` },
    locale: owner.locale,
    userId: owner.id,
    idempotencyKey: `subscription-confirmed:${owner.id}:${sub.plan}`,
  }).catch((error) => log.error("email.confirmed_failed", { error: String(error) }));
}

/** Better Auth Stripe plugin lifecycle hooks (subscription options). */
export const stripeSubscriptionHooks = {
  async onSubscriptionComplete({ subscription }: { subscription: SubscriptionLike }) {
    analytics.capture(subscription.referenceId, "checkout_completed", { plan: subscription.plan });
    await syncLifecycle(subscription);
    if (subscription.status === "active") await sendConfirmed(subscription);
  },
  async onSubscriptionCreated({ subscription }: { subscription: SubscriptionLike }) {
    await syncLifecycle(subscription);
  },
  async onSubscriptionUpdate({ subscription }: { subscription: SubscriptionLike }) {
    await syncLifecycle(subscription);
    // Trial converted (or plan switched): confirm once per plan.
    if (subscription.status === "active") await sendConfirmed(subscription);
  },
  async onSubscriptionCancel({ subscription }: { subscription: SubscriptionLike }) {
    invalidateTags(tags.billing(subscription.referenceId));
  },
  async onSubscriptionDeleted({ subscription }: { subscription: SubscriptionLike }) {
    invalidateTags(tags.billing(subscription.referenceId));
    await pauseUser(subscription.referenceId);
  },

  /** Events the plugin does not map to hooks: trial reminders, failed payments. */
  async onEvent(event: Stripe.Event) {
    if (event.type === "customer.subscription.trial_will_end") {
      const stripeSub = event.data.object;
      const owner = await findUserByCustomer(stripeSub.customer);
      const planName = stripeSub.metadata?.plan ?? "";
      if (!owner || !stripeSub.trial_end) return;
      const item = stripeSub.items.data[0];
      const amount = (item?.price.unit_amount ?? 0) / 100;
      const plan = isPlanId(planName) ? planName : amount >= plans.max.priceUsd ? "max" : "pro";
      const format = getServerFormatter(owner.locale, owner.timezone);
      await sendEmail({
        to: owner.email,
        template: "trial-converting-3d",
        props: {
          plan: planLabel(owner.locale, plan),
          date: format.dateTime(new Date(stripeSub.trial_end * 1000), { dateStyle: "long" }),
          price: format.number(amount || plans[plan].priceUsd, { style: "currency", currency: "USD" }),
          url: `${publicEnv.appUrl}/settings/billing`,
        },
        locale: owner.locale,
        userId: owner.id,
        idempotencyKey: `trial-ending:${owner.id}`,
      });
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const owner = await findUserByCustomer(invoice.customer);
      if (!owner) return;
      invalidateTags(tags.billing(owner.id));
      await sendEmail({
        to: owner.email,
        template: "payment-failed",
        props: { url: `${publicEnv.appUrl}/settings/billing` },
        locale: owner.locale,
        userId: owner.id,
        idempotencyKey: `payment-failed:${owner.id}:${invoice.id}`,
      });
    }
  },
};
