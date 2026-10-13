"use client";

import { Loader2, Monitor, Moon, Sun, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useEffect, useState, useTransition } from "react";
import { useActionFeedback } from "@/components/shared/action-feedback";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { deleteAccount, updateNotifications } from "@/server/actions/settings";

export function ThemeSelector() {
  const t = useTranslations("common");
  const settings = useTranslations("settings");
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const current = mounted ? (theme ?? "system") : "system";
  const options = [
    { value: "light", label: t("themeLight"), icon: Sun },
    { value: "dark", label: t("themeDark"), icon: Moon },
    { value: "system", label: t("themeSystem"), icon: Monitor },
  ];
  return (
    <RadioGroup
      value={current}
      onValueChange={setTheme}
      className="grid grid-cols-3 gap-3"
      aria-label={settings("appearance")}
    >
      {options.map((option) => (
        <label
          key={option.value}
          htmlFor={`theme-${option.value}`}
          className={cn(
            "flex cursor-pointer flex-col items-center gap-2 rounded-lg border p-4 text-sm transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring",
            current === option.value ? "border-primary bg-primary/5" : "hover:bg-accent/50",
          )}
        >
          <RadioGroupItem id={`theme-${option.value}`} value={option.value} className="sr-only" />
          <option.icon className="size-5" aria-hidden="true" />
          {option.label}
        </label>
      ))}
    </RadioGroup>
  );
}

export function NotificationSettings({ enabled }: { enabled: boolean }) {
  const t = useTranslations("settings");
  const common = useTranslations("common");
  const handle = useActionFeedback();
  const [value, setValue] = useState(enabled);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
        <div className="space-y-1">
          <Label htmlFor="notify-problems">{t("notifyProblems")}</Label>
          <p className="text-sm text-muted-foreground">{t("notifyProblemsHint")}</p>
        </div>
        <Switch
          id="notify-problems"
          checked={value}
          disabled={pending}
          onCheckedChange={(checked) => {
            setValue(checked);
            startTransition(async () => {
              if (!handle(await updateNotifications({ emailNotifications: checked }), t("saved"))) {
                setValue(!checked);
              }
            });
          }}
        />
      </div>
      <div className="flex items-start justify-between gap-4 rounded-lg border border-dashed p-4">
        <div className="space-y-1">
          <Label htmlFor="notify-weekly">{t("weeklySummary")}</Label>
          <p className="text-sm text-muted-foreground">{common("comingSoon")}</p>
        </div>
        <Switch id="notify-weekly" checked={false} disabled />
      </div>
    </div>
  );
}

export function DeleteAccountDialog() {
  const t = useTranslations("settings");
  const common = useTranslations("common");
  const handle = useActionFeedback();
  const [deleteMirrors, setDeleteMirrors] = useState(true);
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();
  const word = t("deleteConfirmWord");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">
          <Trash2 /> {t("deleteAccount")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              id="delete-account-mirrors"
              checked={deleteMirrors}
              onCheckedChange={(value) => setDeleteMirrors(value === true)}
            />
            <Label htmlFor="delete-account-mirrors" className="leading-snug font-normal">
              {t("deleteMirrors", { brand: brand.name })}
            </Label>
          </div>
          <div className="space-y-2">
            <Label htmlFor="delete-account-confirm">{t("deleteConfirmLabel", { word })}</Label>
            <Input
              id="delete-account-confirm"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{common("cancel")}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending || confirm !== word}
            onClick={() =>
              startTransition(async () => {
                if (handle(await deleteAccount({ deleteMirrors, confirm: "DELETE" }))) {
                  window.location.assign("/");
                }
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {pending ? t("deleting") : t("deleteConfirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
