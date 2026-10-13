"use client";

import { CheckCircle2, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const POLL_MS = 30_000;

/** Topbar indicator: jobs queued for the user's calendars, polled every 30 s. */
export function SyncIndicator() {
  const t = useTranslations("nav");
  const [pending, setPending] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const response = await fetch("/api/sync-status", { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as { pending: number };
        if (active) setPending(data.pending);
      } catch {
        // Offline: keep the last value.
      }
    }
    void poll();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, POLL_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  if (pending === null) return null;
  const busy = pending > 0;
  const label = busy ? t("syncPending", { count: pending }) : t("syncIdle");
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <output
          aria-label={`${t("syncStatus")}: ${label}`}
          className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs text-muted-foreground"
        >
          {busy ? (
            <RefreshCw className="size-3.5 animate-spin text-primary" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="size-3.5 text-success" aria-hidden="true" />
          )}
          <span className="hidden sm:inline">{label}</span>
        </output>
      </TooltipTrigger>
      <TooltipContent>{t("syncStatus")}</TooltipContent>
    </Tooltip>
  );
}
