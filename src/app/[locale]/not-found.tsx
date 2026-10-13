import { Compass } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <main id="main" className="flex min-h-svh flex-col items-center justify-center gap-6 px-4 text-center">
      <Link href="/" aria-label="Home">
        <Logo />
      </Link>
      <div className="flex size-14 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <Compass className="size-7" aria-hidden="true" />
      </div>
      <div className="space-y-2">
        <p className="font-mono text-sm text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("notFoundTitle")}</h1>
        <p className="max-w-sm text-muted-foreground">{t("notFoundBody")}</p>
      </div>
      <Button asChild>
        <Link href="/">{t("goHome")}</Link>
      </Button>
    </main>
  );
}
