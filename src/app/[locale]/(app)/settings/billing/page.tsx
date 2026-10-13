import { AlertTriangle, CircleCheck, Server } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CheckoutButton, PortalButton, RemoveMirrorsButton } from "@/components/billing/billing-buttons";
import { PlanCard } from "@/components/marketing/plan-card";
import { PageHeader } from "@/components/shared/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { planFeatures } from "@/lib/plan-features";
import { type PlanId, planList, plans } from "@/lib/plans";
import { dataDeletionDate } from "@/server/billing/lifecycle";
import { trialDaysLeft } from "@/server/billing/resolve";
import { getBillingOverview } from "@/server/queries/billing";
import { requestNow } from "@/server/time";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/settings/billing">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "billing" });
  return { title: t("title") };
}

function UsageBar({ label, used, max, text }: { label: string; used: number; max: number; text: string }) {
  const percent = Number.isFinite(max) && max > 0 ? Math.min(100, (used / max) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground tabular-nums">{text}</span>
      </div>
      <Progress value={Number.isFinite(max) ? percent : 4} aria-label={`${label}: ${text}`} />
    </div>
  );
}

async function BillingContent({
  locale,
  searchParams,
}: {
  locale: string;
  searchParams: PageProps<"/[locale]/settings/billing">["searchParams"];
}) {
  const t = await getTranslations({ locale, namespace: "billing" });
  const pricing = await getTranslations({ locale, namespace: "pricing" });
  const common = await getTranslations({ locale, namespace: "common" });
  const format = await getFormatter({ locale });
  const { user, entitlements: ent, usage, trialAvailable } = await getBillingOverview();
  const query = await searchParams;
  const now = await requestNow();
  const date = (value: Date) => format.dateTime(value, { dateStyle: "long", timeZone: user.timezone });
  const price = (plan: PlanId) => format.number(plans[plan].priceUsd, { style: "currency", currency: "USD" });
  const planName = (plan: PlanId) => (plan === "max" ? t("planMax") : t("planPro"));

  if (!ent.billingEnabled) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <Server className="size-5 text-muted-foreground" aria-hidden="true" />
          <div>
            <CardTitle>{t("planSelfHosted")}</CardTitle>
            <CardDescription>{t("selfHostedBody")}</CardDescription>
          </div>
        </CardHeader>
      </Card>
    );
  }

  const subscribed = ent.plan === "trial" || ent.plan === "pro" || ent.plan === "max";
  const planCards = (opts: { trial: boolean }) => (
    <div className="grid gap-6 md:grid-cols-2">
      {planList.map((plan) => (
        <PlanCard
          key={plan.id}
          plan={plan}
          name={pricing(plan.id)}
          tagline={pricing(`${plan.id}Tagline`)}
          price={price(plan.id)}
          perMonth={common("perMonth")}
          features={planFeatures(plan, (key, values) =>
            pricing(key as "calendars", values as { count: number }),
          )}
          highlight={plan.id === "max"}
          highlightLabel={pricing("popular")}
          action={
            <CheckoutButton
              plan={plan.id}
              className="w-full"
              variant={plan.id === "max" ? "default" : "outline"}
              label={opts.trial ? t("startTrial") : t("subscribe", { plan: planName(plan.id) })}
              successUrl="/settings/billing"
              cancelUrl="/settings/billing"
            />
          }
        />
      ))}
    </div>
  );

  const limitNotice =
    query.reason === "calendar_limit" ? (
      <Alert>
        <AlertTriangle aria-hidden="true" />
        <AlertDescription>{t("calendarLimitReason")}</AlertDescription>
      </Alert>
    ) : null;

  if (ent.plan === "none") {
    return (
      <div className="space-y-6">
        {limitNotice}
        <Card>
          <CardHeader>
            <CardTitle>{t("choosePlan")}</CardTitle>
            <CardDescription>{t("noSubscription")}</CardDescription>
          </CardHeader>
        </Card>
        {planCards({ trial: trialAvailable })}
      </div>
    );
  }

  if (ent.plan === "paused") {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>{t("pausedTitle")}</AlertTitle>
          <AlertDescription>
            {t("pausedBody", { date: date(dataDeletionDate(user.pausedAt ?? now)) })}
          </AlertDescription>
        </Alert>
        <div>
          <RemoveMirrorsButton />
        </div>
        <h2 className="text-lg font-semibold">{t("resubscribe")}</h2>
        {planCards({ trial: false })}
      </div>
    );
  }

  const current = ent.planId ?? "pro";
  const other: PlanId = current === "pro" ? "max" : "pro";
  const blockedDowngrade =
    other === "pro" && (usage.calendars > plans.pro.maxCalendars || usage.rules > plans.pro.maxRules);
  const of = (used: number, max: number) =>
    Number.isFinite(max) ? t("of", { used, max }) : t("ofUnlimited", { used });

  return (
    <div className="space-y-6">
      {limitNotice}
      {ent.pastDue ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>{t("pastDue")}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardDescription>{t("currentPlan")}</CardDescription>
            <CardTitle className="flex flex-wrap items-center gap-2 text-2xl">
              {planName(current)}
              {ent.plan === "trial" ? (
                <Badge variant="secondary">
                  {t("badgeTrial", { days: trialDaysLeft(ent.trialEndsAt, now) })}
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <CircleCheck aria-hidden="true" /> {price(current)}
                  {common("perMonth")}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {ent.cancelAtPeriodEnd && ent.periodEnd
              ? t("cancelsOn", { date: date(ent.periodEnd) })
              : ent.plan === "trial" && ent.trialEndsAt
                ? t("trialEnds", { date: date(ent.trialEndsAt), price: price(current) })
                : ent.periodEnd
                  ? t("renews", { date: date(ent.periodEnd) })
                  : null}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            {subscribed ? (
              <CheckoutButton
                plan={other}
                variant="outline"
                label={t("switchTo", { plan: planName(other) })}
                subscriptionId={ent.stripeSubscriptionId}
                successUrl="/settings/billing"
                cancelUrl="/settings/billing"
                disabled={blockedDowngrade}
              />
            ) : null}
            <PortalButton label={t("manage")} />
            {blockedDowngrade ? (
              <p className="w-full text-xs text-muted-foreground">
                {t("switchBlocked", { calendars: plans.pro.maxCalendars, rules: plans.pro.maxRules })}
              </p>
            ) : null}
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("usage")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <UsageBar
              label={t("calendarsUsage")}
              used={usage.calendars}
              max={ent.maxCalendars}
              text={of(usage.calendars, ent.maxCalendars)}
            />
            <UsageBar
              label={t("rulesUsage")}
              used={usage.rules}
              max={ent.maxRules}
              text={of(usage.rules, ent.maxRules)}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("invoices")}</CardTitle>
          <CardDescription>{t("manageHint")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <PortalButton label={t("openPortal")} />
        </CardFooter>
      </Card>
    </div>
  );
}

export default async function BillingPage({ params, searchParams }: PageProps<"/[locale]/settings/billing">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "billing" });
  return (
    <div className="space-y-8">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <Suspense
        fallback={
          <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        }
      >
        <BillingContent locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
