import {
  AlertTriangle,
  CheckCircle2,
  CircleDashed,
  Clock,
  Loader2,
  type LucideIcon,
  PauseCircle,
  SkipForward,
  Trash2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type Tone = "success" | "warning" | "danger" | "neutral" | "info";

const toneClasses: Record<Tone, string> = {
  success: "border-success/25 bg-success/10 text-emerald-700 dark:text-success",
  warning: "border-warning/30 bg-warning/15 text-amber-700 dark:text-warning",
  danger: "border-destructive/25 bg-destructive/10 text-red-700 dark:text-destructive",
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-primary/25 bg-primary/10 text-primary",
};

/** Status pill: color is never the only signal (icon + text). */
export function StatusBadge({
  tone,
  icon: Icon,
  label,
  spin,
  className,
}: {
  tone: Tone;
  icon: LucideIcon;
  label: string;
  spin?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
    >
      <Icon className={cn("size-3.5", spin && "animate-spin")} aria-hidden="true" />
      {label}
    </span>
  );
}

export const ruleStatusStyle = {
  active: { tone: "success", icon: CheckCircle2 },
  paused: { tone: "neutral", icon: PauseCircle },
  error: { tone: "danger", icon: XCircle },
  deleting: { tone: "neutral", icon: Trash2 },
} as const satisfies Record<string, { tone: Tone; icon: LucideIcon }>;

export const connectionStatusStyle = {
  active: { tone: "success", icon: CheckCircle2 },
  needs_reauth: { tone: "warning", icon: AlertTriangle },
  revoked: { tone: "neutral", icon: XCircle },
} as const satisfies Record<string, { tone: Tone; icon: LucideIcon }>;

export const runStatusStyle = {
  queued: { tone: "neutral", icon: Clock },
  running: { tone: "info", icon: Loader2 },
  succeeded: { tone: "success", icon: CheckCircle2 },
  failed: { tone: "danger", icon: XCircle },
  skipped: { tone: "neutral", icon: SkipForward },
} as const satisfies Record<string, { tone: Tone; icon: LucideIcon }>;

export const pendingStyle = { tone: "neutral" as const, icon: CircleDashed };
