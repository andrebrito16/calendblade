import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/server/auth/session";
import { getEntitlements } from "@/server/billing/entitlements";
import { trialDaysLeft } from "@/server/billing/resolve";
import { requestNow } from "@/server/time";
import { UserMenu } from "./user-menu";
import { UserProvider } from "./user-provider";

/** Sidebar footer: user menu with the plan badge text. Streams behind Suspense. */
export async function SidebarUser({ locale }: { locale: string }) {
  const userPromise = getCurrentUser();
  const user = await userPromise;
  const entitlements = await getEntitlements(user.id);
  const t = await getTranslations({ locale, namespace: "billing" });

  let planLabel: string | null = null;
  if (entitlements.billingEnabled) {
    const planName = entitlements.planId === "max" ? t("planMax") : t("planPro");
    planLabel =
      entitlements.plan === "trial"
        ? `${t("badgeTrial", { days: trialDaysLeft(entitlements.trialEndsAt, await requestNow()) })} · ${planName}`
        : entitlements.plan === "paused"
          ? t("planPaused")
          : entitlements.plan === "none"
            ? t("planNone")
            : planName;
  }

  return (
    <UserProvider userPromise={userPromise}>
      <UserMenu planLabel={planLabel} showBilling={entitlements.billingEnabled} />
    </UserProvider>
  );
}
