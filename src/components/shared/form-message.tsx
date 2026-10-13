"use client";

import { useTranslations } from "next-intl";
import { useFormField } from "@/components/ui/form";
import { cn } from "@/lib/utils";

/**
 * FormMessage that translates zod error messages (stored as message keys,
 * e.g. "errors.required") through next-intl.
 */
export function TranslatedFormMessage({ className }: { className?: string }) {
  const t = useTranslations();
  const { error, formMessageId } = useFormField();
  if (!error?.message) return null;
  const key = String(error.message);
  const text = t.has(key as never) ? t(key as never) : key;
  return (
    <p id={formMessageId} className={cn("text-sm text-destructive", className)}>
      {text}
    </p>
  );
}
