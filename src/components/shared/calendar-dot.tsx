import { cn } from "@/lib/utils";

export function CalendarDot({ color, className }: { color: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15",
        className,
      )}
      style={{ backgroundColor: color ?? "var(--muted-foreground)" }}
    />
  );
}
