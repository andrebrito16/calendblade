import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { MagicLinkActions } from "@/components/auth/magic-link-sent";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { env } from "@/server/env";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/magic-link/sent">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("sentTitle"), robots: { index: false } };
}

async function SentBody({
  locale,
  searchParams,
}: {
  locale: string;
  searchParams: PageProps<"/[locale]/magic-link/sent">["searchParams"];
}) {
  const t = await getTranslations({ locale, namespace: "auth" });
  const params = await searchParams;
  const email = typeof params.email === "string" && params.email.includes("@") ? params.email : null;
  return (
    <>
      <CardDescription className="text-center text-pretty">
        {email
          ? t.rich("sentBody", {
              email,
              strong: (chunks) => <strong className="font-medium text-foreground">{chunks}</strong>,
            })
          : t("sentBodyNoEmail")}
      </CardDescription>
      <CardContent className="space-y-4 px-0 pt-4">
        <p className="text-center text-xs text-muted-foreground">{t("sentHint")}</p>
        <MagicLinkActions email={email} devEndpoint={env.DEV_MAGIC_LINK_ENDPOINT} />
      </CardContent>
    </>
  );
}

export default async function MagicLinkSentPage({
  params,
  searchParams,
}: PageProps<"/[locale]/magic-link/sent">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return (
    <Card className="shadow-lg">
      <CardHeader className="items-center text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
          <MailCheck className="size-6" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl">
          <h1>{t("sentTitle")}</h1>
        </CardTitle>
        <Suspense fallback={<CardDescription>{t("sentBodyNoEmail")}</CardDescription>}>
          <SentBody locale={locale} searchParams={searchParams} />
        </Suspense>
      </CardHeader>
    </Card>
  );
}
