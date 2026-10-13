import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { getOptionalUser } from "@/server/auth/session";
import { env } from "@/server/env";

async function AccountActions({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "common" });
  const user = await getOptionalUser();
  if (user) {
    return (
      <Button asChild size="sm">
        <Link href="/dashboard">
          {t("goToApp")} <ArrowRight />
        </Link>
      </Button>
    );
  }
  return <SignedOutActions locale={locale} />;
}

async function SignedOutActions({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "common" });
  return (
    <>
      <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
        <Link href="/sign-in">{t("signIn")}</Link>
      </Button>
      <Button asChild size="sm">
        <Link href="/sign-in">{env.BILLING_ENABLED ? t("getStarted") : t("getStartedSelfHost")}</Link>
      </Button>
    </>
  );
}

export async function SiteHeader({ locale }: { locale: string }) {
  const t = await getTranslations({ locale, namespace: "nav" });
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          href="/"
          className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Logo />
        </Link>
        <nav aria-label={t("mainNavigation")} className="hidden items-center gap-1 md:flex">
          <Button asChild variant="ghost" size="sm">
            <Link href="/#how">{t("howItWorks")}</Link>
          </Button>
          {env.BILLING_ENABLED ? (
            <Button asChild variant="ghost" size="sm">
              <Link href="/pricing">{t("pricing")}</Link>
            </Button>
          ) : null}
          <Button asChild variant="ghost" size="sm">
            <Link href="/#faq">{t("faq")}</Link>
          </Button>
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Suspense fallback={<SignedOutActions locale={locale} />}>
            <AccountActions locale={locale} />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
