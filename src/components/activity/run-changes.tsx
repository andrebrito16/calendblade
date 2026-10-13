import { cn } from "@/lib/utils";

/** "+3 ~1 −0" with an accessible long form. */
export function RunChanges({
  created,
  updated,
  deleted,
  label,
  className,
}: {
  created: number;
  updated: number;
  deleted: number;
  label: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex gap-2 font-mono text-xs tabular-nums", className)} title={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden="true" className={created ? "text-success" : "text-muted-foreground"}>
        +{created}
      </span>
      <span aria-hidden="true" className={updated ? "text-primary" : "text-muted-foreground"}>
        ~{updated}
      </span>
      <span aria-hidden="true" className={deleted ? "text-destructive" : "text-muted-foreground"}>
        −{deleted}
      </span>
    </span>
  );
}
