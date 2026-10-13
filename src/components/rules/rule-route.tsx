import { ArrowDown, ArrowRight } from "lucide-react";
import { CalendarDot } from "@/components/shared/calendar-dot";
import type { RuleSummary } from "@/server/queries/rules";

/** "Source → Target" with each calendar's account email underneath. */
export function RuleRoute({ rule }: { rule: Pick<RuleSummary, "source" | "target"> }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          <CalendarDot color={rule.source.color} />
          <span className="truncate">{rule.source.name}</span>
        </p>
        <p className="truncate pl-4.5 text-xs text-muted-foreground">{rule.source.email}</p>
      </div>
      <ArrowRight className="hidden size-4 shrink-0 text-muted-foreground sm:block" aria-label="→" />
      <ArrowDown className="-my-1 ml-0.5 size-3.5 shrink-0 text-muted-foreground sm:hidden" aria-label="→" />
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          <CalendarDot color={rule.target.color} />
          <span className="truncate">{rule.target.name}</span>
        </p>
        <p className="truncate pl-4.5 text-xs text-muted-foreground">{rule.target.email}</p>
      </div>
    </div>
  );
}
