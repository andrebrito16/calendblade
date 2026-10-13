"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { TimezonePicker } from "@/components/settings/timezone-picker";
import { useActionFeedback } from "@/components/shared/action-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { isValidTimezone } from "@/lib/timezones";
import { updateProfile } from "@/server/actions/settings";

/** Step 1: confirm name and time zone (prefilled from the browser). */
export function ProfileStep({
  initialName,
  initialTimezone,
  nextHref,
}: {
  initialName: string;
  initialTimezone: string;
  nextHref: string;
}) {
  const t = useTranslations("onboarding");
  const common = useTranslations("common");
  const errors = useTranslations("errors");
  const handle = useActionFeedback();
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [detected, setDetected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserZone && isValidTimezone(browserZone)) {
      setDetected(browserZone);
      if (initialTimezone === "UTC") setTimezone(browserZone);
    }
  }, [initialTimezone]);

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) {
          setError(errors("required"));
          return;
        }
        startTransition(async () => {
          if (handle(await updateProfile({ name, timezone }))) router.push(nextHref);
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="onboarding-name">{t("nameLabel")}</Label>
        <Input
          id="onboarding-name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
          autoComplete="name"
          maxLength={80}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "onboarding-name-error" : undefined}
        />
        {error ? (
          <p id="onboarding-name-error" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="onboarding-timezone">{t("timezoneLabel")}</Label>
        <TimezonePicker
          id="onboarding-timezone"
          value={timezone}
          onChange={setTimezone}
          searchPlaceholder={t("timezoneLabel")}
          emptyLabel={common("none")}
        />
        {detected ? (
          <p className="text-sm text-muted-foreground">{t("timezoneDetected", { timezone: detected })}</p>
        ) : null}
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        {common("continue")}
      </Button>
    </form>
  );
}
