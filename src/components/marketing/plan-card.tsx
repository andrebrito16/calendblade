import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import type { Plan } from "@/lib/plans";
import { cn } from "@/lib/utils";

/** Plan card shared by the pricing page, onboarding and billing. */
export function PlanCard({
  plan,
  name,
  tagline,
  price,
  perMonth,
  features,
  highlight,
  highlightLabel,
  action,
}: {
  plan: Plan;
  name: string;
  tagline: string;
  price: string;
  perMonth: string;
  features: string[];
  highlight?: boolean;
  highlightLabel?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-6 rounded-2xl border bg-card p-6 shadow-sm",
        highlight && "border-primary ring-1 ring-primary",
      )}
      data-plan={plan.id}
    >
      {highlight && highlightLabel ? (
        <Badge className="absolute -top-3 left-6">{highlightLabel}</Badge>
      ) : null}
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">{name}</h3>
        <p className="text-sm text-muted-foreground">{tagline}</p>
      </div>
      <p className="flex items-baseline gap-1">
        <span className="text-4xl font-semibold tracking-tight">{price}</span>
        <span className="text-sm text-muted-foreground">{perMonth}</span>
      </p>
      <ul className="flex-1 space-y-2.5 text-sm">
        {features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {action}
    </div>
  );
}
