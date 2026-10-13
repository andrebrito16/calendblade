import { CalendarX2, Lock } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ConnectButtons } from "@/components/connections/connect-buttons";
import { RuleForm } from "@/components/rules/rule-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getEntitlements } from "@/server/billing/entitlements";
import { getCalendarOptions } from "@/server/queries/connections";
import { getUsage } from "@/server/queries/usage";

export async function generateMetadata({ params }: PageProps<"/[locale]/rules/new">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rules" });
  return { title: t("newRule") };
}

async function NewRule({
  locale,
  searchParams,
}: {
  locale: string;
  searchParams: PageProps<"/[locale]/rules/new">["searchParams"];
}) {
  const t = await getTranslations({ locale, namespace: "rules" });
  const onboarding = await getTranslations({ locale, namespace: "onboarding" });
  const errors = await getTranslations({ locale, namespace: "errors" });
  const user = await getCurrentUser();
  const [accounts, entitlements, usage, query] = await Promise.all([
    getCalendarOptions(),
    getEntitlements(user.id),
    getUsage(),
    searchParams,
  ]);
  const used = usage.rules;

  if (!entitlements.canSync) {
    return (
      <EmptyState
        icon={Lock}
        title={entitlements.plan === "paused" ? errors("paused") : errors("noSubscription")}
        action={
          <Button asChild>
            <Link href={entitlements.plan === "paused" ? "/settings/billing" : "/onboarding?step=2"}>
              {onboarding("trialTitle")}
            </Link>
          </Button>
        }
      />
    );
  }
  if (used >= entitlements.maxRules) {
    return (
      <EmptyState
        icon={Lock}
        title={t("limitReached", { count: entitlements.maxRules })}
        action={
          <Button asChild>
            <Link href="/settings/billing">{t("usage", { used, max: entitlements.maxRules })}</Link>
          </Button>
        }
      />
    );
  }

  const active = accounts.filter((account) => account.status === "active");
  const calendarCount = active.reduce((sum, account) => sum + account.calendars.length, 0);
  const writable = active.some((account) => account.calendars.some((calendar) => calendar.writable));
  if (active.length === 0 || calendarCount < 2 || !writable) {
    return (
      <EmptyState
        icon={CalendarX2}
        title={t("emptyTitle")}
        body={active.length === 0 ? t("emptyNeedsConnection") : onboarding("ruleNeedsCalendars")}
        action={<ConnectButtons locale={locale} returnTo="/rules/new" />}
      />
    );
  }

  const afterCreate = query.onboarding === "1" ? "/onboarding?step=5" : undefined;
  return <RuleForm mode="create" accounts={accounts} afterCreate={afterCreate} />;
}

export default async function NewRulePage({ params, searchParams }: PageProps<"/[locale]/rules/new">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rules" });
  return (
    <div className="space-y-8">
      <PageHeader title={t("newRule")} description={t("subtitle")} />
      <Suspense
        fallback={
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <Skeleton className="h-36 rounded-xl" />
              <Skeleton className="h-36 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        }
      >
        <NewRule locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
