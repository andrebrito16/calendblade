import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";

export default async function MarketingLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  return (
    <>
      <SiteHeader locale={locale} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
