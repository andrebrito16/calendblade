import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Empty list placeholder: illustration slot, title, body and primary action. */
export function EmptyState({
  icon: Icon,
  illustration,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon;
  illustration?: ReactNode;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed bg-card/50 px-6 py-14 text-center",
        className,
      )}
    >
      {illustration ??
        (Icon ? (
          <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Icon className="size-6" aria-hidden="true" />
          </div>
        ) : null)}
      <div className="max-w-md space-y-1.5">
        <h2 className="text-base font-semibold">{title}</h2>
        {body ? <p className="text-sm text-muted-foreground text-pretty">{body}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}
