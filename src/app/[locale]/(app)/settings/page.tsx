import { ArrowRight, CreditCard } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { LocaleSelect } from "@/components/settings/locale-select";
import { DeleteAccountDialog, NotificationSettings, ThemeSelector } from "@/components/settings/preferences";
import { PrivacySettings } from "@/components/settings/privacy-settings";
import { ProfileForm } from "@/components/settings/profile-form";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { brand } from "@/lib/brand";
import { getCurrentUser } from "@/server/auth/session";
import { env, publicLocales } from "@/server/env";

export async function generateMetadata({ params }: PageProps<"/[locale]/settings">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "settings" });
  return { title: t("title") };
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 className="text-base">{title}</h2>
        </CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

async function ProfileSection() {
  const user = await getCurrentUser();
  return <ProfileForm initial={{ name: user.name, timezone: user.timezone }} email={user.email} />;
}

async function NotificationSection() {
  const user = await getCurrentUser();
  return <NotificationSettings enabled={user.emailNotifications} />;
}

export default async function SettingsPage({ params }: PageProps<"/[locale]/settings">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "settings" });
  const nav = await getTranslations({ locale, namespace: "nav" });
  const billing = await getTranslations({ locale, namespace: "billing" });

  return (
    <div className="space-y-8">
      <PageHeader title={t("title")} description={t("subtitle")} />
      <div className="grid gap-6">
        <Section title={t("profile")} description={t("profileHint", { brand: brand.name })}>
          <Suspense
            fallback={
              <div className="space-y-4">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
              </div>
            }
          >
            <ProfileSection />
          </Suspense>
          {publicLocales.length > 1 ? (
            <div className="mt-5 border-t pt-5">
              <LocaleSelect locales={publicLocales} />
            </div>
          ) : null}
        </Section>

        {env.BILLING_ENABLED ? (
          <Section title={nav("billing")} description={billing("subtitle")}>
            <Button asChild variant="outline">
              <Link href="/settings/billing">
                <CreditCard /> {billing("manage")} <ArrowRight />
              </Link>
            </Button>
          </Section>
        ) : null}

        <Section title={t("appearance")} description={t("appearanceHint", { brand: brand.name })}>
          <ThemeSelector />
        </Section>

        <Section title={t("notifications")} description={t("notificationsHint")}>
          <Suspense fallback={<Skeleton className="h-20" />}>
            <NotificationSection />
          </Suspense>
        </Section>

        <Section title={t("privacy")} description={t("privacyHint")}>
          <PrivacySettings />
        </Section>

        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>
              <h2 className="text-base text-destructive">{t("dangerZone")}</h2>
            </CardTitle>
            <CardDescription>{t("deleteAccountHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteAccountDialog />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
