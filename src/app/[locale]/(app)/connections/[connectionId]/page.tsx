import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import {
  DisconnectDialog,
  HiddenSwitch,
  RefreshCalendarsButton,
} from "@/components/connections/connection-actions";
import { ConnectionFeedback } from "@/components/connections/connection-feedback";
import { ConnectionStatusBadge } from "@/components/connections/connection-status";
import { ProviderLabel } from "@/components/connections/provider-label";
import { CalendarDot } from "@/components/shared/calendar-dot";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { getConnection } from "@/server/queries/connections";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/connections/[connectionId]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "connections" });
  return { title: t("title") };
}

const roleKey = {
  owner: "roleOwner",
  writer: "roleWriter",
  reader: "roleReader",
  freeBusyReader: "roleFreeBusyReader",
} as const;

async function ConnectionDetail({ locale, connectionId }: { locale: string; connectionId: string }) {
  const t = await getTranslations({ locale, namespace: "connections" });
  const format = await getFormatter({ locale });
  const user = await getCurrentUser();
  const data = await getConnection(connectionId);
  if (!data) notFound();
  const { connection, calendars } = data;
  const showWatch = env.NODE_ENV !== "production";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-12">
            {connection.avatarUrl ? <AvatarImage src={connection.avatarUrl} alt="" /> : null}
            <AvatarFallback>{connection.email[0]?.toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{connection.email}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <ConnectionStatusBadge locale={locale} status={connection.status} />
              <ProviderLabel locale={locale} provider={connection.provider} />
              <span>
                ·{" "}
                {t("accountSince", {
                  date: format.dateTime(connection.createdAt, {
                    dateStyle: "medium",
                    timeZone: user.timezone,
                  }),
                })}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {connection.status === "needs_reauth" ? (
            <Button asChild>
              <a href={`/api/connections/${connection.provider}/start?reconnect=${connection.id}`}>
                {t("reconnect")}
              </a>
            </Button>
          ) : (
            <RefreshCalendarsButton connectionId={connection.id} />
          )}
          <DisconnectDialog connectionId={connection.id} email={connection.email} />
        </div>
      </div>

      {connection.status === "needs_reauth" ? (
        <Alert className="border-warning/40 bg-warning/10">
          <AlertTitle>{t("statusNeedsReauth")}</AlertTitle>
          <AlertDescription>{t("reauthBanner", { email: connection.email })}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">{t("calendarsHeading")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("detailSubtitle")} {t("readOnlyHint")}
          </p>
        </div>
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("calendar")}</TableHead>
                <TableHead className="hidden sm:table-cell">{t("role")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("usedInRules")}</TableHead>
                {showWatch ? <TableHead className="hidden lg:table-cell">{t("watch")}</TableHead> : null}
                <TableHead className="text-right">{t("visible")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calendars.map((calendar) => (
                <TableRow key={calendar.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <CalendarDot color={calendar.color} />
                      <span className="font-medium">{calendar.name}</span>
                      {calendar.isPrimary ? <Badge variant="secondary">{t("primary")}</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground sm:hidden">
                      {t(roleKey[calendar.accessRole as keyof typeof roleKey] ?? "roleReader")}
                    </p>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {t(roleKey[calendar.accessRole as keyof typeof roleKey] ?? "roleReader")}
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">{calendar.ruleCount}</TableCell>
                  {showWatch ? (
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {calendar.watchExpiresAt
                        ? t("watchActive", {
                            date: format.dateTime(calendar.watchExpiresAt, {
                              dateStyle: "medium",
                              timeStyle: "short",
                              timeZone: user.timezone,
                            }),
                          })
                        : t("watchNone")}
                    </TableCell>
                  ) : null}
                  <TableCell className="text-right">
                    <HiddenSwitch
                      calendarId={calendar.id}
                      hidden={calendar.isHidden}
                      label={`${t("visible")}: ${calendar.name}`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  );
}

async function Feedback({
  searchParams,
}: {
  searchParams: PageProps<"/[locale]/connections/[connectionId]">["searchParams"];
}) {
  const params = await searchParams;
  return (
    <ConnectionFeedback
      connected={typeof params.connected === "string" ? params.connected : null}
      error={typeof params.error === "string" ? params.error : null}
    />
  );
}

async function ConnectionDetailFromParams({
  params,
}: {
  params: PageProps<"/[locale]/connections/[connectionId]">["params"];
}) {
  const { locale, connectionId } = await params;
  return <ConnectionDetail locale={locale} connectionId={connectionId} />;
}

export default async function ConnectionPage({
  params,
  searchParams,
}: PageProps<"/[locale]/connections/[connectionId]">) {
  const t = await getTranslations("connections");
  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link href="/connections">
          <ArrowLeft /> {t("backToList")}
        </Link>
      </Button>
      <Suspense fallback={null}>
        <Feedback searchParams={searchParams} />
      </Suspense>
      <Suspense
        fallback={
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <Skeleton className="size-12 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-7 w-64" />
                <Skeleton className="h-4 w-40" />
              </div>
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        }
      >
        <ConnectionDetailFromParams params={params} />
      </Suspense>
    </div>
  );
}
