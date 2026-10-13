import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { CookieSettingsButton } from "@/components/consent/cookie-settings-button";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Link } from "@/i18n/navigation";

export default async function AuthLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  const legal = await getTranslations({ locale, namespace: "legal" });
  return (
    <div className="relative flex min-h-svh flex-col bg-muted/40">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/10 to-transparent"
      />
      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link
          href="/"
          className="rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="relative flex flex-1 items-start justify-center px-4 pt-8 pb-16 sm:pt-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="relative flex justify-center gap-4 pb-8 text-xs text-muted-foreground">
        <Link href="/legal/privacy" className="hover:text-foreground">
          {legal("privacyTitle")}
        </Link>
        <Link href="/legal/terms" className="hover:text-foreground">
          {legal("termsTitle")}
        </Link>
        <Link href="/legal/cookies" className="hover:text-foreground">
          {legal("cookiesTitle")}
        </Link>
        <CookieSettingsButton className="hover:text-foreground" />
      </footer>
    </div>
  );
}
