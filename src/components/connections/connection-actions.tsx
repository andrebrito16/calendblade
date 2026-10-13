"use client";

import { Loader2, RefreshCw, Unplug } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useActionFeedback } from "@/components/shared/action-feedback";
import {
  AlertDialog,
  AlertDialogAction,
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
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { brand } from "@/lib/brand";
import { disconnectConnection, refreshCalendars, setCalendarHidden } from "@/server/actions/connections";

export function RefreshCalendarsButton({ connectionId }: { connectionId: string }) {
  const t = useTranslations("connections");
  const handle = useActionFeedback();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          handle(await refreshCalendars(connectionId), t("refreshed"));
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {pending ? t("refreshing") : t("refresh")}
    </Button>
  );
}

export function HiddenSwitch({
  calendarId,
  hidden,
  label,
}: {
  calendarId: string;
  hidden: boolean;
  label: string;
}) {
  const t = useTranslations("connections");
  const handle = useActionFeedback();
  const [visible, setVisible] = useState(!hidden);
  const [pending, startTransition] = useTransition();
  return (
    <Switch
      checked={visible}
      disabled={pending}
      aria-label={label}
      onCheckedChange={(checked) => {
        setVisible(checked);
        startTransition(async () => {
          const result = await setCalendarHidden(calendarId, !checked);
          if (!handle(result, t("hiddenUpdated"))) setVisible(!checked);
        });
      }}
    />
  );
}

export function DisconnectDialog({ connectionId, email }: { connectionId: string; email: string }) {
  const t = useTranslations("connections");
  const common = useTranslations("common");
  const handle = useActionFeedback();
  const router = useRouter();
  const [deleteMirrors, setDeleteMirrors] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" className="text-destructive hover:text-destructive">
          <Unplug /> {t("disconnect")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("disconnectTitle", { email })}</AlertDialogTitle>
          <AlertDialogDescription>{t("disconnectBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox
            id="disconnect-delete-mirrors"
            checked={deleteMirrors}
            onCheckedChange={(value) => setDeleteMirrors(value === true)}
          />
          <Label htmlFor="disconnect-delete-mirrors" className="leading-snug font-normal">
            {t("disconnectDeleteMirrors", { brand: brand.name })}
          </Label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{common("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              startTransition(async () => {
                const result = await disconnectConnection(connectionId, { deleteMirrors });
                if (handle(result, t("disconnected"))) {
                  setOpen(false);
                  router.push("/connections");
                }
              });
            }}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {t("disconnectConfirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
