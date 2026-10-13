import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { getTranslations } from "next-intl/server";
import { LegalDocument } from "@/components/marketing/legal-document";

export async function generateMetadata({ params }: PageProps<"/[locale]/legal/privacy">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "legal" });
  return { title: t("privacyTitle") };
}

export default async function Page({ params }: PageProps<"/[locale]/legal/privacy">) {
  "use cache";
  cacheLife("days");
  const { locale } = await params;
  return <LegalDocument locale={locale} kind="privacy" />;
}
