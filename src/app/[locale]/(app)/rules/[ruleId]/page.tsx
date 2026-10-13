import { AlertTriangle, ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { RunChanges } from "@/components/activity/run-changes";
import { RuleDetailActions } from "@/components/rules/rule-actions";
import { RuleModeBadge, RuleStatusBadge } from "@/components/rules/rule-badges";
import { RuleRoute } from "@/components/rules/rule-route";
import { formatDuration, RelativeTime } from "@/components/shared/relative-time";
import { runStatusStyle, StatusBadge } from "@/components/shared/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { brand } from "@/lib/brand";
import { getCurrentUser } from "@/server/auth/session";
import { getRule, getRuleRuns } from "@/server/queries/rules";
import { requestNow } from "@/server/time";

export async function generateMetadata({ params }: PageProps<"/[locale]/rules/[ruleId]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rules" });
  return { title: t("title") };
}

const triggerKey = {
  webhook: "triggerWebhook",
  cron: "triggerCron",
  manual: "triggerManual",
  initial: "triggerInitial",
} as const;

async function RuleDetail({ locale, ruleId }: { locale: string; ruleId: string }) {
  const t = await getTranslations({ locale, namespace: "rules" });
  const activityT = await getTranslations({ locale, namespace: "activity" });
  const user = await getCurrentUser();
  const [rule, runs] = await Promise.all([getRule(ruleId), getRuleRuns(ruleId)]);
  if (!rule) notFound();
  const now = await requestNow();
  const reason = rule.statusReason
    ? t(`reason.${rule.statusReason as "unknown"}`, { brand: brand.name })
    : null;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <h1 className="sr-only">
            {rule.source.name} → {rule.target.name}
          </h1>
          <div className="text-lg">
            <RuleRoute rule={rule} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RuleModeBadge locale={locale} mode={rule.mode} />
            <RuleStatusBadge locale={locale} status={rule.status} />
          </div>
        </div>
        <RuleDetailActions ruleId={rule.id} status={rule.status} mirrorCount={rule.mirrorCount} />
      </div>

      {reason && (rule.status === "error" || rule.status === "paused") ? (
        <Alert variant={rule.status === "error" ? "destructive" : "default"}>
          <AlertTriangle aria-hidden="true" />
          <AlertDescription>
            {rule.status === "error" ? t("statusError") : t("statusPaused")}: {reason}
          </AlertDescription>
        </Alert>
      ) : null}

      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          [t("mirrorsManaged"), rule.mirrorCount.toLocaleString(locale)],
          [t("window"), t("windowValue", { past: rule.settings.pastDays, future: rule.settings.futureDays })],
          [
            t("lastRun"),
            rule.lastRunAt ? (
              <RelativeTime
                key="last"
                date={rule.lastRunAt}
                locale={locale}
                timeZone={user.timezone}
                now={now}
              />
            ) : (
              t("noRuns")
            ),
          ],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border bg-card p-4">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <Card className="gap-0 py-0">
        <CardHeader className="py-4">
          <CardTitle className="text-base">
            <h2>{t("recentRuns")}</h2>
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {runs.length === 0 ? (
            <p className="px-6 pb-6 text-sm text-muted-foreground">{t("noRuns")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">{activityT("time")}</TableHead>
                  <TableHead>{activityT("trigger")}</TableHead>
                  <TableHead>{activityT("status")}</TableHead>
                  <TableHead>{activityT("changes")}</TableHead>
                  <TableHead className="hidden pr-6 sm:table-cell">{activityT("duration")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => {
                  const style = runStatusStyle[run.status];
                  return (
                    <TableRow key={run.id}>
                      <TableCell className="pl-6 text-sm">
                        <RelativeTime
                          date={run.startedAt}
                          locale={locale}
                          timeZone={user.timezone}
                          now={now}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {activityT(triggerKey[run.trigger])}
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          tone={style.tone}
                          icon={style.icon}
                          spin={run.status === "running"}
                          label={activityT(
                            `status${run.status[0]?.toUpperCase()}${run.status.slice(1)}` as "statusSucceeded",
                          )}
                        />
                        {run.errorCode ? (
                          <p className="mt-1 text-xs text-destructive">{run.errorCode}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                      <TableCell className="hidden pr-6 text-sm text-muted-foreground tabular-nums sm:table-cell">
                        {run.finishedAt
                          ? formatDuration(run.finishedAt.getTime() - run.startedAt.getTime())
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function RuleDetailFromParams({ params }: { params: PageProps<"/[locale]/rules/[ruleId]">["params"] }) {
  const { locale, ruleId } = await params;
  return <RuleDetail locale={locale} ruleId={ruleId} />;
}

export default async function RulePage({ params }: PageProps<"/[locale]/rules/[ruleId]">) {
  const t = await getTranslations("nav");
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link href="/rules">
          <ArrowLeft /> {t("rules")}
        </Link>
      </Button>
      <Suspense
        fallback={
          <div className="space-y-8">
            <Skeleton className="h-16 w-full max-w-md" />
            <div className="grid gap-4 sm:grid-cols-3">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-20 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        }
      >
        <RuleDetailFromParams params={params} />
      </Suspense>
    </div>
  );
}
