import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Providers } from "@/components/providers";
import { routing } from "@/i18n/routing";
import { brand } from "@/lib/brand";
import { publicEnv } from "@/lib/env.public";
import "@/styles/globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/** Namespaces Client Components use; marketing, legal and email copy stay server-side. */
const CLIENT_NAMESPACES = [
  "common",
  "nav",
  "auth",
  "onboarding",
  "dashboard",
  "connections",
  "rules",
  "activity",
  "billing",
  "banners",
  "settings",
  "errors",
  "consent",
] as const;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: "metadata" });
  return {
    metadataBase: new URL(publicEnv.appUrl),
    title: { default: t("title", { brand: brand.name }), template: `%s · ${brand.name}` },
    description: t("description"),
    applicationName: brand.name,
    openGraph: { siteName: brand.name, type: "website", locale },
    twitter: { card: "summary_large_image" },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const messages = await getMessages({ locale });
  const clientMessages = Object.fromEntries(
    CLIENT_NAMESPACES.map((namespace) => [namespace, messages[namespace]]),
  );
  const t = await getTranslations({ locale, namespace: "common" });

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-background px-4 py-2 focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:ring-2 focus:ring-ring"
        >
          {t("skipToContent")}
        </a>
        <NextIntlClientProvider locale={locale} messages={clientMessages} timeZone="UTC">
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
