import { ArrowRight, Cable } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { ConnectButtons } from "@/components/connections/connect-buttons";
import { ConnectionFeedback } from "@/components/connections/connection-feedback";
import { ConnectionStatusBadge } from "@/components/connections/connection-status";
import { ProviderLabel } from "@/components/connections/provider-label";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { brand } from "@/lib/brand";
import { getCurrentUser } from "@/server/auth/session";
import { getEntitlements } from "@/server/billing/entitlements";
import { getConnections } from "@/server/queries/connections";
import { getUsage } from "@/server/queries/usage";

export async function generateMetadata({ params }: PageProps<"/[locale]/connections">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "connections" });
  return { title: t("title") };
}

async function Usage({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "connections" });
  const user = await getCurrentUser();
  const [entitlements, usage] = await Promise.all([getEntitlements(user.id), getUsage()]);
  const used = usage.calendars;
  if (!entitlements.billingEnabled || !entitlements.canSync) return null;
  return (
    <span className="mt-1 block">
      {t("connectedCalendarsUsage", { used, max: entitlements.maxCalendars })}
    </span>
  );
}

async function ConnectionList({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "connections" });
  const common = await getTranslations({ locale, namespace: "common" });
  const format = await getFormatter({ locale });
  const user = await getCurrentUser();
  const connections = await getConnections();

  if (connections.length === 0) {
    return (
      <EmptyState
        icon={Cable}
        title={t("emptyTitle")}
        body={t("emptyBody")}
        action={<ConnectButtons locale={locale} />}
      />
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {connections.map((connection) => (
        <li key={connection.id}>
          <Card className="h-full gap-4">
            <CardHeader className="flex flex-row items-center gap-3">
              <Avatar className="size-10">
                {connection.avatarUrl ? <AvatarImage src={connection.avatarUrl} alt="" /> : null}
                <AvatarFallback>{connection.email[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" title={connection.email}>
                  {connection.email}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ProviderLabel locale={locale} provider={connection.provider} /> ·{" "}
                  {t("calendarsCount", { count: connection.calendarCount })}
                </p>
              </div>
            </CardHeader>
            <CardContent className="flex-1 space-y-2">
              <ConnectionStatusBadge locale={locale} status={connection.status} />
              {connection.status === "needs_reauth" ? (
                <p className="text-sm text-muted-foreground">
                  {t("reauthBanner", { email: connection.email })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("accountSince", {
                    date: format.dateTime(connection.createdAt, {
                      dateStyle: "medium",
                      timeZone: user.timezone,
                    }),
                  })}
                </p>
              )}
            </CardContent>
            <CardFooter className="gap-2">
              {connection.status === "needs_reauth" ? (
                <Button asChild size="sm">
                  <a href={`/api/connections/${connection.provider}/start?reconnect=${connection.id}`}>
                    {t("reconnect")}
                  </a>
                </Button>
              ) : null}
              <Button asChild size="sm" variant="outline">
                <Link href={`/connections/${connection.id}`} prefetch>
                  {common("manage")} <ArrowRight />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        </li>
      ))}
    </ul>
  );
}

async function Feedback({
  searchParams,
}: {
  searchParams: PageProps<"/[locale]/connections">["searchParams"];
}) {
  const params = await searchParams;
  return (
    <ConnectionFeedback
      connected={typeof params.connected === "string" ? params.connected : null}
      error={typeof params.error === "string" ? params.error : null}
    />
  );
}

export default async function ConnectionsPage({ params, searchParams }: PageProps<"/[locale]/connections">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "connections" });
  return (
    <div className="space-y-8">
      <PageHeader
        title={t("title")}
        description={
          <>
            {t("subtitle", { brand: brand.name })}{" "}
            <Suspense fallback={null}>
              <Usage locale={locale} />
            </Suspense>
          </>
        }
        actions={
          <Suspense fallback={<Skeleton className="h-9 w-52" />}>
            <ConnectButtons locale={locale} />
          </Suspense>
        }
      />
      <Suspense fallback={null}>
        <Feedback searchParams={searchParams} />
      </Suspense>
      <Suspense
        fallback={
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-48 rounded-xl" />
            ))}
          </div>
        }
      >
        <ConnectionList locale={locale} />
      </Suspense>
    </div>
  );
}
