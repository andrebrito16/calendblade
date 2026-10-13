import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/sign-in-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Link, redirect } from "@/i18n/navigation";
import { brand } from "@/lib/brand";
import { getOptionalUser } from "@/server/auth/session";
import { isGoogleConfigured } from "@/server/env";

export async function generateMetadata({ params }: PageProps<"/[locale]/sign-in">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common" });
  return { title: t("signIn"), robots: { index: false } };
}

async function SignInContent({
  locale,
  searchParams,
}: {
  locale: string;
  searchParams: PageProps<"/[locale]/sign-in">["searchParams"];
}) {
  const user = await getOptionalUser();
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : null;
  if (user) redirect({ href: next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard", locale });
  const error = typeof params.error === "string" ? params.error : null;
  return <SignInForm googleEnabled={isGoogleConfigured} next={next} initialError={error} />;
}

export default async function SignInPage({ params, searchParams }: PageProps<"/[locale]/sign-in">) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return (
    <Card className="shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-xl">
          <h1>{t("signInTitle", { brand: brand.name })}</h1>
        </CardTitle>
        <CardDescription>{t("signInSubtitle")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Suspense
          fallback={
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          }
        >
          <SignInContent locale={locale} searchParams={searchParams} />
        </Suspense>
        <p className="text-center text-xs text-balance text-muted-foreground">
          {t.rich("termsNotice", {
            terms: (chunks) => (
              <Link href="/legal/terms" className="underline underline-offset-2 hover:text-foreground">
                {chunks}
              </Link>
            ),
            privacy: (chunks) => (
              <Link href="/legal/privacy" className="underline underline-offset-2 hover:text-foreground">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </CardContent>
    </Card>
  );
}
