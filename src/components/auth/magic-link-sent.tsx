"use client";

import { ExternalLink, Loader2, RotateCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";

const COOLDOWN_SECONDS = 30;

export function MagicLinkActions({ email, devEndpoint }: { email: string | null; devEndpoint: boolean }) {
  const t = useTranslations("auth");
  const [cooldown, setCooldown] = useState(COOLDOWN_SECONDS);
  const [pending, setPending] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (!devEndpoint || !email) return;
    fetch(`/api/dev/magic-link?email=${encodeURIComponent(email)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { url?: string } | null) => setDevLink(data?.url ?? null))
      .catch(() => setDevLink(null));
  }, [devEndpoint, email]);

  async function resend() {
    if (!email) return;
    setPending(true);
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: "/dashboard",
      newUserCallbackURL: "/onboarding",
      errorCallbackURL: "/sign-in",
    });
    setPending(false);
    if (error) {
      toast.error(error.status === 429 ? t("errorRateLimited") : t("errorGeneric"));
      return;
    }
    toast.success(t("resent"));
    setCooldown(COOLDOWN_SECONDS);
  }

  return (
    <div className="space-y-3">
      {email ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={resend}
          disabled={pending || cooldown > 0}
        >
          {pending ? <Loader2 className="animate-spin" /> : <RotateCw />}
          {cooldown > 0 ? t("resendIn", { seconds: cooldown }) : t("resend")}
        </Button>
      ) : null}
      <Button asChild variant="ghost" className="w-full">
        <Link href="/sign-in">{t("changeEmail")}</Link>
      </Button>
      {devLink ? (
        <Button asChild variant="secondary" className="w-full" data-testid="dev-magic-link">
          <a href={devLink}>
            <ExternalLink /> {t("devLink")}
          </a>
        </Button>
      ) : null}
    </div>
  );
}
