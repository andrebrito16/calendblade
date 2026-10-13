"use client";

import { Loader2, Mail } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { GoogleIcon } from "./google-icon";

function safeNext(next: string | null) {
  return next?.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
}

export function SignInForm({
  googleEnabled,
  next,
  initialError,
}: {
  googleEnabled: boolean;
  next: string | null;
  initialError: string | null;
}) {
  const t = useTranslations("auth");
  const common = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(
    initialError
      ? initialError === "INVALID_TOKEN" || initialError === "EXPIRED_TOKEN"
        ? t("errorInvalidLink")
        : t("errorGeneric")
      : null,
  );
  const callbackURL = safeNext(next);
  // The input is uncontrolled so text typed before hydration isn't lost; submitting stays
  // disabled until then so the browser can't fall back to a native GET with the email in the URL.
  const hydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  async function signInWithGoogle() {
    setPending("google");
    setError(null);
    const { error: authError } = await authClient.signIn.social({
      provider: "google",
      callbackURL,
      newUserCallbackURL: "/onboarding",
      errorCallbackURL: "/sign-in",
    });
    if (authError) {
      setError(t("errorGeneric"));
      setPending(null);
    }
  }

  async function sendMagicLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError(t("errorInvalidEmail"));
      return;
    }
    setPending("email");
    setError(null);
    const { error: authError } = await authClient.signIn.magicLink({
      email,
      callbackURL,
      newUserCallbackURL: "/onboarding",
      errorCallbackURL: "/sign-in",
    });
    if (authError) {
      setError(authError.status === 429 ? t("errorRateLimited") : t("errorGeneric"));
      setPending(null);
      return;
    }
    router.push(`/magic-link/sent?email=${encodeURIComponent(email)}`);
  }

  return (
    <div className="space-y-5">
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {googleEnabled ? (
        <>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            size="lg"
            onClick={signInWithGoogle}
            disabled={pending !== null}
          >
            {pending === "google" ? <Loader2 className="animate-spin" /> : <GoogleIcon className="size-4" />}
            {t("continueWithGoogle")}
          </Button>
          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground uppercase">{common("or")}</span>
            <Separator className="flex-1" />
          </div>
        </>
      ) : null}

      <form onSubmit={sendMagicLink} className="space-y-3" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">{t("emailLabel")}</Label>
          <Input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            placeholder={t("emailPlaceholder")}
            disabled={pending !== null}
            required
            aria-describedby="magic-link-hint"
          />
        </div>
        <Button type="submit" className="w-full" size="lg" disabled={pending !== null || !hydrated}>
          {pending === "email" ? <Loader2 className="animate-spin" /> : <Mail />}
          {pending === "email" ? t("sending") : t("sendMagicLink")}
        </Button>
        <p id="magic-link-hint" className="text-center text-xs text-muted-foreground">
          {t("magicLinkHint")}
        </p>
      </form>
    </div>
  );
}

function subscribeNoop() {
  return () => {};
}
