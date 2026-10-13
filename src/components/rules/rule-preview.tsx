"use client";

import { Clock, Lock, MapPin, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { CalendarDot } from "@/components/shared/calendar-dot";

/** Live preview: how an example event looks once mirrored with the current options. */
export function RulePreview({
  mode,
  busyTitle,
  titlePrefix,
  color,
  targetName,
}: {
  mode: "full" | "busy";
  busyTitle: string;
  titlePrefix: string;
  color: string | null;
  targetName: string | null;
}) {
  const t = useTranslations("rules.form");
  const sync = useTranslations("rules");
  const title =
    mode === "busy"
      ? busyTitle.trim() || t("busyTitlePlaceholder")
      : [titlePrefix.trim(), t("previewSourceTitle")].filter(Boolean).join(" ");

  return (
    <div className="rounded-xl border bg-muted/30 p-4" aria-live="polite">
      <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {t("preview")}
        {targetName ? ` · ${t("previewIn", { calendar: targetName })}` : null}
      </p>
      <div
        className="rounded-lg border-l-4 bg-card p-3 shadow-sm"
        style={{ borderLeftColor: color ?? "var(--primary)" }}
      >
        <p className="flex items-center gap-1.5 font-medium">
          {mode === "busy" ? <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" /> : null}
          {title}
        </p>
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden="true" /> {t("previewTime")}
        </p>
        {mode === "full" ? (
          <>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5" aria-hidden="true" /> {t("previewSourceLocation")}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="size-3.5" aria-hidden="true" /> {t("previewSourceGuests")}
            </p>
          </>
        ) : null}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarDot color={color} className="size-2" />
        {mode === "full" ? sync("modeFull") : sync("modeBusy")}
      </p>
    </div>
  );
}
