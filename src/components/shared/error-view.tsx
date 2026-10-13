"use client";

import * as Sentry from "@sentry/nextjs";
import { AlertTriangle, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

/** Error boundary body: reports to Sentry (when configured) and offers a retry. */
export function ErrorView({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("errors");
  const common = useTranslations("common");
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("body")}</p>
      {error.digest ? <p className="font-mono text-xs text-muted-foreground">{error.digest}</p> : null}
      <div className="flex gap-2">
        <Button onClick={reset}>
          <RotateCw /> {common("retry")}
        </Button>
        <Button asChild variant="outline">
          <Link href="/">{t("goHome")}</Link>
        </Button>
      </div>
    </div>
  );
}
