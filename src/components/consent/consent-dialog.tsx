"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Link } from "@/i18n/navigation";
import { useConsent } from "./consent-provider";

function Category({
  id,
  title,
  body,
  checked,
  disabled,
  onChange,
  badge,
}: {
  id: string;
  title: string;
  body: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
  badge?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
      <div className="space-y-1">
        <Label htmlFor={id} className="flex items-center gap-2">
          {title}
          {badge ? <span className="text-xs font-normal text-muted-foreground">{badge}</span> : null}
        </Label>
        <p className="text-sm text-muted-foreground">{body}</p>
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

/** Granular preferences; also reachable later to change or withdraw consent. */
export function ConsentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("consent");
  const { consent, services, decide } = useConsent();
  const [errors, setErrors] = useState(false);
  const [analytics, setAnalytics] = useState(false);

  useEffect(() => {
    if (open) {
      setErrors(consent?.errors ?? false);
      setAnalytics(consent?.analytics ?? false);
    }
  }, [open, consent]);

  const none = !services.errors && !services.analytics;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("preferencesTitle")}</DialogTitle>
          <DialogDescription>
            {t.rich("preferencesBody", {
              cookies: (chunks) => (
                <Link
                  href="/legal/cookies"
                  className="underline underline-offset-2"
                  onClick={() => onOpenChange(false)}
                >
                  {chunks}
                </Link>
              ),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Category
            id="consent-necessary"
            title={t("necessaryTitle")}
            body={t("necessaryBody")}
            checked
            disabled
            badge={t("alwaysOn")}
          />
          {services.errors ? (
            <Category
              id="consent-errors"
              title={t("errorsTitle")}
              body={t("errorsBody")}
              checked={errors}
              onChange={setErrors}
            />
          ) : null}
          {services.analytics ? (
            <Category
              id="consent-analytics"
              title={t("analyticsTitle")}
              body={t("analyticsBody")}
              checked={analytics}
              onChange={setAnalytics}
            />
          ) : null}
          {none ? <p className="text-sm text-muted-foreground">{t("noOptional")}</p> : null}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={() => decide({ errors: false, analytics: false })}>
            {t("rejectAll")}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => decide({ errors: true, analytics: true })}>
              {t("acceptAll")}
            </Button>
            <Button onClick={() => decide({ errors, analytics })}>{t("save")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
