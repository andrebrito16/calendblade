"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePathname, useRouter } from "@/i18n/navigation";

type Option = { value: string; label: string };

/** URL-driven filters for the activity log (rule, status, period). */
export function ActivityFilters({
  rules,
  current,
}: {
  rules: Option[];
  current: { rule: string; status: string; range: string };
}) {
  const t = useTranslations("activity");
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  function update(key: "rule" | "status" | "range", value: string) {
    const next = { ...current, [key]: value };
    const params = new URLSearchParams();
    if (next.rule !== "all") params.set("rule", next.rule);
    if (next.status !== "all") params.set("status", next.status);
    if (next.range !== "7d") params.set("range", next.range);
    const query = params.toString();
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }));
  }

  const filter = (id: "rule" | "status" | "range", label: string, options: Option[]) => (
    <div className="min-w-0 flex-1 space-y-1.5 sm:max-w-56">
      <Label htmlFor={`filter-${id}`} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={current[id]} onValueChange={(value) => update(id, value)} disabled={pending}>
        <SelectTrigger id={`filter-${id}`} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap" aria-busy={pending}>
      {filter("rule", t("filterRule"), [{ value: "all", label: t("allRules") }, ...rules])}
      {filter("status", t("filterStatus"), [
        { value: "all", label: t("allStatuses") },
        { value: "succeeded", label: t("statusSucceeded") },
        { value: "failed", label: t("statusFailed") },
        { value: "skipped", label: t("statusSkipped") },
        { value: "running", label: t("statusRunning") },
      ])}
      {filter("range", t("filterRange"), [
        { value: "24h", label: t("range24h") },
        { value: "7d", label: t("range7d") },
        { value: "30d", label: t("range30d") },
        { value: "90d", label: t("range90d") },
      ])}
    </div>
  );
}
