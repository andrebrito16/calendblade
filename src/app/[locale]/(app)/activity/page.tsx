import { ChevronLeft, ChevronRight, History } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ActivityFilters } from "@/components/activity/activity-filters";
import { RunChanges } from "@/components/activity/run-changes";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { formatDuration, RelativeTime } from "@/components/shared/relative-time";
import { runStatusStyle, StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getRules } from "@/server/queries/rules";
import { ACTIVITY_RANGES, type ActivityRange, getActivity, type RunStatus } from "@/server/queries/runs";
import { requestNow } from "@/server/time";

export async function generateMetadata({ params }: PageProps<"/[locale]/activity">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "activity" });
  return { title: t("title") };
}

const STATUSES: RunStatus[] = ["queued", "running", "succeeded", "failed", "skipped"];
const triggerKey = {
  webhook: "triggerWebhook",
  cron: "triggerCron",
  manual: "triggerManual",
  initial: "triggerInitial",
} as const;
const UUID = /^[0-9a-f-]{36}$/i;

async function ActivityContent({
  locale,
  searchParams,
}: {
  locale: string;
  searchParams: PageProps<"/[locale]/activity">["searchParams"];
}) {
  const t = await getTranslations({ locale, namespace: "activity" });
  const user = await getCurrentUser();
  const query = await searchParams;
  const ruleId = typeof query.rule === "string" && UUID.test(query.rule) ? query.rule : undefined;
  const status = STATUSES.includes(query.status as RunStatus) ? (query.status as RunStatus) : undefined;
  const range = (
    Object.keys(ACTIVITY_RANGES).includes(String(query.range)) ? query.range : "7d"
  ) as ActivityRange;
  const page = Math.max(1, Math.min(1000, Number(query.page) || 1));

  const [rules, { rows, hasNext }] = await Promise.all([
    getRules(),
    getActivity({ ruleId, status, range, page }),
  ]);
  const now = await requestNow();
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (ruleId) params.set("rule", ruleId);
    if (status) params.set("status", status);
    if (range !== "7d") params.set("range", range);
    if (target > 1) params.set("page", String(target));
    const value = params.toString();
    return value ? `/activity?${value}` : "/activity";
  };

  return (
    <div className="space-y-4">
      <ActivityFilters
        rules={rules
          .filter((rule) => rule.status !== "deleting")
          .map((rule) => ({ value: rule.id, label: `${rule.source.name} → ${rule.target.name}` }))}
        current={{ rule: ruleId ?? "all", status: status ?? "all", range }}
      />

      {rows.length === 0 ? (
        <EmptyState icon={History} title={t("emptyTitle")} body={t("emptyBody")} />
      ) : (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">{t("time")}</TableHead>
                <TableHead>{t("rule")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("trigger")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("changes")}</TableHead>
                <TableHead className="hidden pr-4 lg:table-cell">{t("duration")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((run) => {
                const style = runStatusStyle[run.status];
                return (
                  <TableRow key={run.id} className="align-top">
                    <TableCell className="pl-4 text-sm whitespace-nowrap">
                      <RelativeTime date={run.startedAt} locale={locale} timeZone={user.timezone} now={now} />
                    </TableCell>
                    <TableCell className="max-w-64 text-sm">
                      {run.sourceName && run.targetName ? (
                        <Link href={`/rules/${run.ruleId}`} className="line-clamp-2 hover:underline">
                          {run.sourceName} → {run.targetName}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{t("deletedRule")}</span>
                      )}
                      <span className="mt-1 block text-xs text-muted-foreground md:hidden">
                        {t(triggerKey[run.trigger])}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {t(triggerKey[run.trigger])}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        tone={style.tone}
                        icon={style.icon}
                        spin={run.status === "running"}
                        label={t(
                          `status${run.status[0]?.toUpperCase()}${run.status.slice(1)}` as "statusSucceeded",
                        )}
                      />
                      <RunChanges
                        className="mt-1.5 sm:hidden"
                        created={run.createdCount}
                        updated={run.updatedCount}
                        deleted={run.deletedCount}
                        label={t("changesLabel", {
                          created: run.createdCount,
                          updated: run.updatedCount,
                          deleted: run.deletedCount,
                        })}
                      />
                      {run.errorMessage ? (
                        <details className="mt-1.5 max-w-xs text-xs">
                          <summary className="cursor-pointer text-destructive">{t("details")}</summary>
                          <p className="mt-1 font-mono break-words text-muted-foreground">
                            {run.errorCode}: {run.errorMessage}
                          </p>
                        </details>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <RunChanges
                        created={run.createdCount}
                        updated={run.updatedCount}
                        deleted={run.deletedCount}
                        label={t("changesLabel", {
                          created: run.createdCount,
                          updated: run.updatedCount,
                          deleted: run.deletedCount,
                        })}
                      />
                    </TableCell>
                    <TableCell className="hidden pr-4 text-sm text-muted-foreground tabular-nums lg:table-cell">
                      {run.finishedAt
                        ? formatDuration(run.finishedAt.getTime() - run.startedAt.getTime())
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {page > 1 || hasNext ? (
        <nav className="flex items-center justify-between" aria-label={t("page", { page })}>
          <Button asChild variant="outline" size="sm" className={page > 1 ? undefined : "invisible"}>
            <Link href={pageHref(page - 1)}>
              <ChevronLeft /> {t("previous")}
            </Link>
          </Button>
          <span className="text-sm text-muted-foreground">{t("page", { page })}</span>
          <Button asChild variant="outline" size="sm" className={hasNext ? undefined : "invisible"}>
            <Link href={pageHref(page + 1)}>
              {t("next")} <ChevronRight />
            </Link>
          </Button>
        </nav>
      ) : null}
    </div>
  );
}

export default async function ActivityPage({ params, searchParams }: PageProps<"/[locale]/activity">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "activity" });
  return (
    <div className="space-y-8">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <Suspense
        fallback={
          <div className="space-y-4">
            <div className="flex gap-3">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-14 w-48" />
              ))}
            </div>
            <Skeleton className="h-96 rounded-xl" />
          </div>
        }
      >
        <ActivityContent locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
