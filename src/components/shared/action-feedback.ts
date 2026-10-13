"use client";

import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { ActionResult } from "@/lib/action-result";

/** Shows a toast for a failed Server Action result. Returns true on success. */
export function useActionFeedback() {
  const t = useTranslations("errors");
  return function handle<T>(result: ActionResult<T>, success?: string): result is { ok: true; data: T } {
    if (result.ok) {
      if (success) toast.success(success);
      return true;
    }
    if (result.error.code === "unauthorized") {
      toast.error(t("unauthorized"));
      window.location.assign("/sign-in");
      return false;
    }
    const key = result.error.code === "conflict" ? "conflict" : result.error.code;
    toast.error(t(key as "unknown"));
    return false;
  };
}
