import { FlaskConical, Lock, Plus } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { GoogleIcon } from "@/components/auth/google-icon";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Link } from "@/i18n/navigation";
import { getCurrentUser } from "@/server/auth/session";
import { getEntitlements } from "@/server/billing/entitlements";
import { availableProviders } from "@/server/providers/registry";
import { getUsage } from "@/server/queries/usage";

/**
 * "Connect Google account" (and the demo provider in development). These are
 * plain anchors: the start route redirects to the provider. Disabled with an
 * explanation when the plan's calendar limit is reached.
 */
export async function ConnectButtons({
  locale,
  returnTo,
  size = "default",
  variant = "default",
}: {
  locale: string;
  returnTo?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline";
}) {
  const t = await getTranslations({ locale, namespace: "connections" });
  const user = await getCurrentUser();
  const [entitlements, usage] = await Promise.all([getEntitlements(user.id), getUsage()]);
  const used = usage.calendars;
  const providers = availableProviders();
  const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";

  if (!entitlements.canSync) {
    return (
      <Button asChild size={size} variant={variant}>
        <Link href={entitlements.plan === "paused" ? "/settings/billing" : "/onboarding?step=2"}>
          <Lock /> {t("connectGoogle")}
        </Link>
      </Button>
    );
  }

  if (used >= entitlements.maxCalendars) {
    const reason = t("limitReached", { count: entitlements.maxCalendars });
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              // biome-ignore lint/a11y/noNoninteractiveTabindex: lets keyboard users reach the tooltip explaining why the button is disabled
              tabIndex={0}
              className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Button size={size} variant={variant} disabled aria-describedby="calendar-limit-reason">
                <Plus /> {t("connectGoogle")}
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent id="calendar-limit-reason">{reason}</TooltipContent>
        </Tooltip>
        {entitlements.plan === "trial" ? null : (
          <Button asChild size={size} variant="link">
            <Link href="/settings/billing?reason=calendar_limit">{t("upgrade")}</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {providers.includes("google") ? (
        <Button asChild size={size} variant={variant}>
          <a href={`/api/connections/google/start${query}`}>
            <GoogleIcon className="size-4" /> {t("connectGoogle")}
          </a>
        </Button>
      ) : null}
      {providers.includes("fixture") ? (
        <Button asChild size={size} variant={providers.includes("google") ? "outline" : variant}>
          <a href={`/api/connections/fixture/start${query}`} data-testid="connect-demo">
            <FlaskConical /> {t("connectFixture")}
          </a>
        </Button>
      ) : null}
    </div>
  );
}
