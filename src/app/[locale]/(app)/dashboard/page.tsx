import { AlertTriangle, ArrowRight, Cable, CalendarSync, CheckCircle2, Plus, Workflow } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { RunChanges } from "@/components/activity/run-changes";
import { ConnectButtons } from "@/components/connections/connect-buttons";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { RelativeTime } from "@/components/shared/relative-time";
import { runStatusStyle, StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { brand } from "@/lib/brand";
import { getCurrentUser } from "@/server/auth/session";
import { getConnections } from "@/server/queries/connections";
import { getRules } from "@/server/queries/rules";
import { getDashboardStats } from "@/server/queries/runs";
import { requestNow } from "@/server/time";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return { title: t("title") };
}

function StatCard({
  title,
  icon: Icon,
  value,
  detail,
  href,
}: {
  title: string;
  icon: typeof Cable;
  value: React.ReactNode;
  detail: React.ReactNode;
  href: string;
}) {
  return (
    <Card className="gap-3 py-5 transition-colors hover:border-primary/40">
      <CardHeader className="flex flex-row items-center justify-between px-5">
        <CardDescription className="font-medium">{title}</CardDescription>
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent className="space-y-1 px-5">
        <Link href={href} className="block text-3xl font-semibold tabular-nums after:absolute after:inset-0">
          {value}
        </Link>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </CardContent>
    </Card>
  );
}

async function DashboardContent({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "dashboard" });
  const rulesT = await getTranslations({ locale, namespace: "rules" });
  const activityT = await getTranslations({ locale, namespace: "activity" });
  const user = await getCurrentUser();
  const [connections, rules, stats] = await Promise.all([getConnections(), getRules(), getDashboardStats()]);
  const now = await requestNow();

  if (connections.length === 0) {
    return (
      <EmptyState
        icon={CalendarSync}
        title={t("emptyTitle")}
        body={t("emptyBody")}
        action={<ConnectButtons locale={locale} />}
      />
    );
  }

  const unhealthy = connections.filter((connection) => connection.status !== "active");
  const visibleRules = rules.filter((rule) => rule.status !== "deleting");
  const count = (status: string) => visibleRules.filter((rule) => rule.status === status).length;
  const erroredRules = visibleRules.filter((rule) => rule.status === "error");
  const attention = [
    ...unhealthy.map((connection) => ({
      key: connection.id,
      href: `/connections/${connection.id}`,
      text: t("reauthItem", { email: connection.email }),
    })),
    ...erroredRules.map((rule) => ({
      key: rule.id,
      href: `/rules/${rule.id}`,
      text: t("ruleErrorItem", {
        source: rule.source.name,
        target: rule.target.name,
        reason: rulesT(`reason.${(rule.statusReason ?? "unknown") as "unknown"}`, { brand: brand.name }),
      }),
    })),
  ];

  return (
    <div className="space-y-8">
      <section aria-label={t("title")} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative">
          <StatCard
            title={t("connectionsCard")}
            icon={Cable}
            href="/connections"
            value={connections.length}
            detail={
              unhealthy.length > 0 ? (
                <span className="text-amber-700 dark:text-warning">
                  {t("connectionsUnhealthy", { count: unhealthy.length })}
                </span>
              ) : (
                t("connectionsHealthy", { count: connections.length })
              )
            }
          />
        </div>
        <div className="relative">
          <StatCard
            title={t("rulesCard")}
            icon={Workflow}
            href="/rules"
            value={visibleRules.length}
            detail={t("rulesBreakdown", {
              active: count("active"),
              paused: count("paused"),
              error: count("error"),
            })}
          />
        </div>
        <div className="relative sm:col-span-2 lg:col-span-1">
          <StatCard
            title={t("last24h")}
            icon={CalendarSync}
            href="/activity"
            value={t("runs", { count: stats.last24h.runs })}
            detail={
              <span className="flex gap-3">
                <span>
                  {t("created")}:{" "}
                  <strong className="font-medium text-foreground tabular-nums">
                    {stats.last24h.created}
                  </strong>
                </span>
                <span>
                  {t("updated")}:{" "}
                  <strong className="font-medium text-foreground tabular-nums">
                    {stats.last24h.updated}
                  </strong>
                </span>
                <span>
                  {t("deleted")}:{" "}
                  <strong className="font-medium text-foreground tabular-nums">
                    {stats.last24h.deleted}
                  </strong>
                </span>
              </span>
            }
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              <h2>{t("needsAttention")}</h2>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {attention.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
                {t("allGood")}
              </p>
            ) : (
              <ul className="space-y-2">
                {attention.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm hover:bg-warning/15"
                    >
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                      <span>{item.text}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              <h2>{t("recentActivity")}</h2>
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link href="/activity">
                {t("viewAll")} <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {stats.recent.length === 0 ? (
              <p className="text-sm text-muted-foreground">{activityT("emptyBody")}</p>
            ) : (
              <ul className="divide-y">
                {stats.recent.map((run) => {
                  const style = runStatusStyle[run.status];
                  return (
                    <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm">
                      <StatusBadge
                        tone={style.tone}
                        icon={style.icon}
                        spin={run.status === "running"}
                        label={activityT(
                          `status${run.status[0]?.toUpperCase()}${run.status.slice(1)}` as "statusSucceeded",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {run.sourceName && run.targetName
                          ? `${run.sourceName} → ${run.targetName}`
                          : activityT("deletedRule")}
                      </span>
                      <RunChanges
                        created={run.createdCount}
                        updated={run.updatedCount}
                        deleted={run.deletedCount}
                        label={activityT("changesLabel", {
                          created: run.createdCount,
                          updated: run.updatedCount,
                          deleted: run.deletedCount,
                        })}
                      />
                      <span className="text-xs text-muted-foreground">
                        <RelativeTime
                          date={run.startedAt}
                          locale={locale}
                          timeZone={user.timezone}
                          now={now}
                        />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <Skeleton className="h-56 rounded-xl lg:col-span-2" />
        <Skeleton className="h-56 rounded-xl lg:col-span-3" />
      </div>
    </div>
  );
}

export default async function DashboardPage({ params }: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "dashboard" });
  return (
    <div className="space-y-8">
      <PageHeader
        title={t("title")}
        description={t("subtitle")}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/connections">
                <Cable /> {t("connectCalendar")}
              </Link>
            </Button>
            <Button asChild>
              <Link href="/rules/new">
                <Plus /> {t("newRule")}
              </Link>
            </Button>
          </>
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent locale={locale} />
      </Suspense>
    </div>
  );
}
