import { ArrowRight, Check, CheckCircle2, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { CheckoutButton } from "@/components/billing/billing-buttons";
import { ConnectButtons } from "@/components/connections/connect-buttons";
import { PlanCard } from "@/components/marketing/plan-card";
import { FinishOnboardingButton } from "@/components/onboarding/finish-button";
import { ProfileStep } from "@/components/onboarding/profile-step";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { brand } from "@/lib/brand";
import { planFeatures } from "@/lib/plan-features";
import { planList } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth/session";
import { getEntitlements } from "@/server/billing/entitlements";
import { getCalendarOptions } from "@/server/queries/connections";
import { getUsage } from "@/server/queries/usage";

export async function generateMetadata({ params }: PageProps<"/[locale]/onboarding">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });
  return { title: t("title") };
}

type StepKey = "profile" | "trial" | "connect" | "rule" | "done";
const STEP_NUMBERS: Record<StepKey, number> = { profile: 1, trial: 2, connect: 3, rule: 4, done: 5 };

function stepsFor(billing: boolean): StepKey[] {
  return billing ? ["profile", "trial", "connect", "rule", "done"] : ["profile", "connect", "rule", "done"];
}

function hrefFor(step: StepKey) {
  return `/onboarding?step=${STEP_NUMBERS[step]}`;
}

async function Stepper({ locale, steps, current }: { locale: string; steps: StepKey[]; current: StepKey }) {
  const t = await getTranslations({ locale, namespace: "onboarding" });
  const labels: Record<StepKey, string> = {
    profile: t("stepProfile"),
    trial: t("stepTrial"),
    connect: t("stepConnect"),
    rule: t("stepRule"),
    done: t("stepDone"),
  };
  const index = steps.indexOf(current);
  return (
    <ol
      className="flex items-center gap-2"
      aria-label={t("stepOf", { current: index + 1, total: steps.length })}
    >
      {steps.map((step, position) => {
        const done = position < index;
        const active = position === index;
        return (
          <li
            key={step}
            className="flex flex-1 items-center gap-2"
            aria-current={active ? "step" : undefined}
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-primary text-primary ring-4 ring-primary/15",
                !done && !active && "text-muted-foreground",
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden="true" /> : position + 1}
            </span>
            <span
              className={cn("hidden text-sm md:inline", active ? "font-medium" : "text-muted-foreground")}
            >
              {labels[step]}
            </span>
            {position < steps.length - 1 ? (
              <span className="h-px flex-1 bg-border" aria-hidden="true" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

async function OnboardingContent({
  locale,
  searchParams,
}: {
  locale: string;
  searchParams: PageProps<"/[locale]/onboarding">["searchParams"];
}) {
  const t = await getTranslations({ locale, namespace: "onboarding" });
  const pricing = await getTranslations({ locale, namespace: "pricing" });
  const billingT = await getTranslations({ locale, namespace: "billing" });
  const common = await getTranslations({ locale, namespace: "common" });
  const format = await getFormatter({ locale });
  const user = await getCurrentUser();
  const [entitlements, accounts, query] = await Promise.all([
    getEntitlements(user.id),
    getCalendarOptions(),
    searchParams,
  ]);
  const billing = entitlements.billingEnabled;
  const steps = stepsFor(billing);

  const requested = Number(query.step) || 1;
  let current: StepKey =
    (Object.entries(STEP_NUMBERS).find(([, number]) => number === requested)?.[0] as StepKey | undefined) ??
    "profile";
  if (!steps.includes(current)) current = "connect";
  if (billing && !entitlements.canSync && STEP_NUMBERS[current] > STEP_NUMBERS.trial) current = "trial";
  const next = steps[steps.indexOf(current) + 1] ?? "done";
  const activeAccounts = accounts.filter((account) => account.status === "active");

  let body: React.ReactNode;
  let title = "";
  let description: React.ReactNode = null;

  switch (current) {
    case "profile":
      title = t("profileTitle");
      description = t("profileBody", { brand: brand.name });
      body = <ProfileStep initialName={user.name} initialTimezone={user.timezone} nextHref={hrefFor(next)} />;
      break;
    case "trial": {
      title = entitlements.canSync ? t("trialActive") : t("trialTitle");
      if (entitlements.canSync) {
        const plan = entitlements.planId === "max" ? billingT("planMax") : billingT("planPro");
        description = t("trialActiveBody", { plan });
        body = (
          <Button asChild>
            <Link href={hrefFor("connect")}>
              {common("continue")} <ArrowRight />
            </Link>
          </Button>
        );
      } else {
        const { trialAvailable } = await getUsage();
        description = t("trialBody");
        body = (
          <div className="space-y-4">
            {query.canceled ? (
              <Alert>
                <AlertDescription>{t("trialCanceled")}</AlertDescription>
              </Alert>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2">
              {planList.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  name={pricing(plan.id)}
                  tagline={pricing(`${plan.id}Tagline`)}
                  price={format.number(plan.priceUsd, { style: "currency", currency: "USD" })}
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
                      label={
                        trialAvailable
                          ? t("trialChoose", { plan: pricing(plan.id) })
                          : billingT("subscribe", { plan: pricing(plan.id) })
                      }
                      successUrl="/onboarding?step=3"
                      cancelUrl="/onboarding?step=2&canceled=1"
                    />
                  }
                />
              ))}
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="size-4" aria-hidden="true" /> {pricing("priceNote")}
            </p>
          </div>
        );
      }
      break;
    }
    case "connect":
      title = t("connectTitle");
      description = t("connectBody", { brand: brand.name });
      body = (
        <div className="space-y-5">
          <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">{t("connectScopes")}</p>
          {activeAccounts.length > 0 ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium">
                <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                {t("connected", { count: activeAccounts.length })}
              </p>
              <ul className="space-y-1 pl-6 text-sm text-muted-foreground">
                {activeAccounts.map((account) => (
                  <li key={account.id}>{account.email}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <ConnectButtons
              locale={locale}
              returnTo={hrefFor("connect")}
              variant={activeAccounts.length > 0 ? "outline" : "default"}
            />
            {activeAccounts.length > 0 ? (
              <Button asChild>
                <Link href={hrefFor("rule")}>
                  {common("continue")} <ArrowRight />
                </Link>
              </Button>
            ) : (
              <Button asChild variant="ghost">
                <Link href={hrefFor("rule")}>{common("skip")}</Link>
              </Button>
            )}
          </div>
        </div>
      );
      break;
    case "rule": {
      const calendarCount = activeAccounts.reduce((sum, account) => sum + account.calendars.length, 0);
      title = t("ruleTitle");
      description = t("ruleBody");
      body = (
        <div className="space-y-4">
          {calendarCount < 2 ? (
            <Alert>
              <AlertDescription>{t("ruleNeedsCalendars")}</AlertDescription>
            </Alert>
          ) : null}
          <div className="flex flex-wrap gap-3">
            {calendarCount >= 2 ? (
              <Button asChild>
                <Link href="/rules/new?onboarding=1">
                  {t("ruleCta")} <ArrowRight />
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href={hrefFor("connect")}>{t("connectAnother")}</Link>
              </Button>
            )}
            <Button asChild variant="ghost">
              <Link href={hrefFor("done")}>{common("skip")}</Link>
            </Button>
          </div>
        </div>
      );
      break;
    }
    case "done":
      title = t("doneTitle");
      description = t("doneBody");
      body = (
        <div className="space-y-6">
          <ul className="space-y-3">
            {[t("doneItem1"), t("doneItem2"), t("doneItem3")].map((item) => (
              <li key={item} className="flex gap-3 text-sm">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <FinishOnboardingButton label={t("doneCta")} />
        </div>
      );
      break;
  }

  return (
    <div className="space-y-8">
      <Stepper locale={locale} steps={steps} current={current} />
      <Card
        className={
          current === "trial" && !entitlements.canSync ? "border-0 bg-transparent shadow-none" : undefined
        }
      >
        <CardHeader className={current === "trial" && !entitlements.canSync ? "px-0" : undefined}>
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {t("stepOf", { current: steps.indexOf(current) + 1, total: steps.length })}
          </p>
          <CardTitle>
            <h2 className="text-xl">{title}</h2>
          </CardTitle>
          {description ? <CardDescription className="text-pretty">{description}</CardDescription> : null}
        </CardHeader>
        <CardContent className={current === "trial" && !entitlements.canSync ? "px-0" : undefined}>
          {body}
        </CardContent>
      </Card>
    </div>
  );
}

export default async function OnboardingPage({ params, searchParams }: PageProps<"/[locale]/onboarding">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding" });
  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <Suspense
        fallback={
          <div className="space-y-8">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-72 rounded-xl" />
          </div>
        }
      >
        <OnboardingContent locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
