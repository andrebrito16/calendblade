import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { CookieSettingsButton } from "@/components/consent/cookie-settings-button";
import { Link } from "@/i18n/navigation";
import { brand } from "@/lib/brand";
import { env } from "@/server/env";

export async function SiteFooter({ locale }: { locale: string }) {
  "use cache";
  const t = await getTranslations({ locale, namespace: "marketing.footer" });
  const nav = await getTranslations({ locale, namespace: "nav" });
  const legal = await getTranslations({ locale, namespace: "legal" });
  const year = new Date().getFullYear();

  const linkClass = "text-sm text-muted-foreground transition-colors hover:text-foreground";
  return (
    <footer className="border-t bg-muted/30">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="space-y-3 md:col-span-2">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">{t("tagline")}</p>
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">{t("product")}</h2>
          <ul className="space-y-2">
            <li>
              <Link className={linkClass} href="/#how">
                {nav("howItWorks")}
              </Link>
            </li>
            {env.BILLING_ENABLED ? (
              <li>
                <Link className={linkClass} href="/pricing">
                  {nav("pricing")}
                </Link>
              </li>
            ) : null}
            <li>
              <a className={linkClass} href={brand.repositoryUrl} rel="noreferrer" target="_blank">
                {t("source")}
              </a>
            </li>
          </ul>
        </div>
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">{t("legal")}</h2>
          <ul className="space-y-2">
            <li>
              <Link className={linkClass} href="/legal/privacy">
                {legal("privacyTitle")}
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/legal/terms">
                {legal("termsTitle")}
              </Link>
            </li>
            <li>
              <Link className={linkClass} href="/legal/cookies">
                {legal("cookiesTitle")}
              </Link>
            </li>
            <li>
              <CookieSettingsButton className={linkClass} />
            </li>
            <li>
              <a className={linkClass} href={`mailto:${brand.supportEmail}`}>
                {brand.supportEmail}
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <p>{t("rights", { year, entity: brand.legalEntityName })}</p>
          <p>{t("trademark", { brand: brand.name })}</p>
        </div>
      </div>
    </footer>
  );
}
