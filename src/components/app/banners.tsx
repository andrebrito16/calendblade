import { AlertTriangle, CreditCard, type LucideIcon, PauseCircle, Sparkles } from "lucide-react";
import { getFormatter, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { getCurrentUser } from "@/server/auth/session";
import { getEntitlements } from "@/server/billing/entitlements";
import { dataDeletionDate } from "@/server/billing/lifecycle";
import { trialDaysLeft } from "@/server/billing/resolve";
import { getConnections } from "@/server/queries/connections";
import { requestNow } from "@/server/time";
import { HideOnPaths } from "./hide-on-paths";

type Banner = {
  key: string;
  tone: "warning" | "danger" | "info";
  icon: LucideIcon;
  text: string;
  action: { href: string; label: string };
  hideOn?: string[];
};

const toneClass = {
  warning: "border-warning/30 bg-warning/10",
  danger: "border-destructive/30 bg-destructive/10",
  info: "border-primary/20 bg-primary/5",
};

/** Global banners: trial converting, payment failed, paused, reauth, no subscription. */
export async function AppBanners({ locale }: { locale: string }) {
  const user = await getCurrentUser();
  const [entitlements, connections] = await Promise.all([getEntitlements(user.id), getConnections()]);
  const t = await getTranslations({ locale, namespace: "banners" });
  const billingT = await getTranslations({ locale, namespace: "billing" });
  const format = await getFormatter({ locale });
  const date = (value: Date) => format.dateTime(value, { dateStyle: "medium", timeZone: user.timezone });
  const banners: Banner[] = [];

  if (entitlements.billingEnabled) {
    if (entitlements.plan === "paused" && user.pausedAt) {
      banners.push({
        key: "paused",
        tone: "danger",
        icon: PauseCircle,
        text: t("paused", { date: date(dataDeletionDate(user.pausedAt)) }),
        action: { href: "/settings/billing", label: t("resubscribe") },
        hideOn: ["/settings/billing"],
      });
    } else if (entitlements.plan === "none") {
      banners.push({
        key: "none",
        tone: "info",
        icon: Sparkles,
        text: t("noSubscription"),
        action: { href: "/onboarding?step=2", label: t("startTrial") },
        hideOn: ["/onboarding", "/settings/billing"],
      });
    }
    if (entitlements.pastDue) {
      banners.push({
        key: "pastDue",
        tone: "danger",
        icon: CreditCard,
        text: t("paymentFailed"),
        action: { href: "/settings/billing", label: t("manageBilling") },
      });
    }
    if (entitlements.plan === "trial" && entitlements.trialEndsAt && !entitlements.cancelAtPeriodEnd) {
      const days = trialDaysLeft(entitlements.trialEndsAt, await requestNow());
      if (days <= 3) {
        banners.push({
          key: "trial",
          tone: "info",
          icon: Sparkles,
          text: t("trialEnding", {
            days,
            plan: entitlements.planId === "max" ? billingT("planMax") : billingT("planPro"),
            date: date(entitlements.trialEndsAt),
          }),
          action: { href: "/settings/billing", label: t("manageBilling") },
          hideOn: ["/settings/billing"],
        });
      }
    }
  }

  const reauth = connections.filter((connection) => connection.status === "needs_reauth");
  if (reauth.length > 0) {
    banners.push({
      key: "reauth",
      tone: "warning",
      icon: AlertTriangle,
      text: t("reauth", { count: reauth.length }),
      action: {
        href: reauth.length === 1 ? `/connections/${reauth[0]?.id}` : "/connections",
        label: t("fix"),
      },
    });
  }

  if (banners.length === 0) return null;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-2 px-4 pt-4 md:px-8">
      {banners.map((banner) => (
        <HideOnPaths key={banner.key} paths={banner.hideOn ?? []}>
          <div
            aria-live="polite"
            className={cn(
              "flex flex-col gap-3 rounded-lg border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
              toneClass[banner.tone],
            )}
          >
            <p className="flex items-start gap-2">
              <banner.icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{banner.text}</span>
            </p>
            <Button asChild size="sm" variant="outline" className="shrink-0 bg-background">
              <Link href={banner.action.href}>{banner.action.label}</Link>
            </Button>
          </div>
        </HideOnPaths>
      ))}
    </div>
  );
}
