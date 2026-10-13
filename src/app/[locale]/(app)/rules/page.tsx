import { Plus, Workflow } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ConnectButtons } from "@/components/connections/connect-buttons";
import { RuleActionsMenu } from "@/components/rules/rule-actions";
import { RuleModeBadge, RuleStatusBadge } from "@/components/rules/rule-badges";
import { RuleRoute } from "@/components/rules/rule-route";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth/session";
import { getEntitlements } from "@/server/billing/entitlements";
import { getConnections } from "@/server/queries/connections";
import { getRules } from "@/server/queries/rules";
import { getUsage } from "@/server/queries/usage";
import { requestNow } from "@/server/time";

const FILTERS = ["all", "active", "paused", "error"] as const;
type Filter = (typeof FILTERS)[number];

export async function generateMetadata({ params }: PageProps<"/[locale]/rules">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rules" });
  return { title: t("title") };
}

async function NewRuleButton({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "rules" });
  const user = await getCurrentUser();
  const [entitlements, usage] = await Promise.all([getEntitlements(user.id), getUsage()]);
  const used = usage.rules;
  const atLimit = entitlements.canSync && used >= entitlements.maxRules;
  return (
    <div className="flex flex-col items-end gap-1">
      {atLimit ? (
        <Button asChild variant="outline">
          <Link href="/settings/billing">{t("limitReached", { count: entitlements.maxRules })}</Link>
        </Button>
      ) : (
        <Button asChild>
          <Link href="/rules/new">
            <Plus /> {t("newRule")}
          </Link>
        </Button>
      )}
      {entitlements.billingEnabled && Number.isFinite(entitlements.maxRules) && entitlements.canSync ? (
        <span className="text-xs text-muted-foreground">
          {t("usage", { used, max: entitlements.maxRules })}
        </span>
      ) : null}
    </div>
  );
}

async function RulesList({ locale, filter }: { locale: string; filter: Filter }) {
  const t = await getTranslations({ locale, namespace: "rules" });
  const user = await getCurrentUser();
  const [rules, connections] = await Promise.all([getRules(), getConnections()]);
  const now = await requestNow();

  if (rules.length === 0) {
    return connections.length === 0 ? (
      <EmptyState
        icon={Workflow}
        title={t("emptyTitle")}
        body={t("emptyNeedsConnection")}
        action={<ConnectButtons locale={locale} />}
      />
    ) : (
      <EmptyState
        icon={Workflow}
        title={t("emptyTitle")}
        body={t("emptyBody")}
        action={
          <Button asChild>
            <Link href="/rules/new">
              <Plus /> {t("newRule")}
            </Link>
          </Button>
        }
      />
    );
  }

  const visible = filter === "all" ? rules : rules.filter((rule) => rule.status === filter);
  const lastRun = (date: Date | null) =>
    date ? <RelativeTime date={date} locale={locale} timeZone={user.timezone} now={now} /> : t("noRuns");

  return (
    <div className="space-y-4">
      <nav aria-label={t("filterLabel")} className="flex flex-wrap gap-1">
        {FILTERS.map((value) => {
          const count = value === "all" ? rules.length : rules.filter((rule) => rule.status === value).length;
          const active = value === filter;
          return (
            <Link
              key={value}
              href={value === "all" ? "/rules" : `/rules?status=${value}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
                active ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
              )}
            >
              {value === "all"
                ? t("filterAll")
                : t(`status${value[0]?.toUpperCase()}${value.slice(1)}` as "statusActive")}
              <span className={cn("tabular-nums text-xs", active ? "opacity-80" : "text-muted-foreground")}>
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {t("emptyTitle")}
        </p>
      ) : (
        <>
          <Card className="hidden overflow-hidden py-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t("source")} → {t("target")}
                  </TableHead>
                  <TableHead>{t("mode")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("lastRun")}</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">{t("actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((rule) => (
                  <TableRow key={rule.id} className="relative">
                    <TableCell className="max-w-sm">
                      <Link
                        href={`/rules/${rule.id}`}
                        prefetch
                        className="block rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        <RuleRoute rule={rule} />
                      </Link>
                    </TableCell>
                    <TableCell>
                      <RuleModeBadge locale={locale} mode={rule.mode} />
                    </TableCell>
                    <TableCell>
                      <RuleStatusBadge locale={locale} status={rule.status} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{lastRun(rule.lastRunAt)}</TableCell>
                    <TableCell>
                      <RuleActionsMenu
                        ruleId={rule.id}
                        status={rule.status}
                        label={`${rule.source.name} → ${rule.target.name}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          <ul className="space-y-3 md:hidden">
            {visible.map((rule) => (
              <li key={rule.id}>
                <Card className="gap-3 px-4 py-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/rules/${rule.id}`} className="min-w-0 flex-1">
                      <RuleRoute rule={rule} />
                    </Link>
                    <RuleActionsMenu
                      ruleId={rule.id}
                      status={rule.status}
                      label={`${rule.source.name} → ${rule.target.name}`}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <RuleModeBadge locale={locale} mode={rule.mode} />
                    <RuleStatusBadge locale={locale} status={rule.status} />
                    <span className="text-xs text-muted-foreground">
                      {t("lastRun")}: {lastRun(rule.lastRunAt)}
                    </span>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

async function FilteredRules({
  locale,
  searchParams,
}: {
  locale: string;
  searchParams: PageProps<"/[locale]/rules">["searchParams"];
}) {
  const params = await searchParams;
  const filter = FILTERS.includes(params.status as Filter) ? (params.status as Filter) : "all";
  return <RulesList locale={locale} filter={filter} />;
}

export default async function RulesPage({ params, searchParams }: PageProps<"/[locale]/rules">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rules" });
  return (
    <div className="space-y-8">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <Suspense fallback={<Skeleton className="h-9 w-28" />}>
            <NewRuleButton locale={locale} />
          </Suspense>
        }
      />
      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        }
      >
        <FilteredRules locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
