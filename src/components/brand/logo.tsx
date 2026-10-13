import { brand } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Two overlapping calendars: the original and its mirror. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7 text-primary", className)}>
      <rect x="2.5" y="5.5" width="18" height="18" rx="4.5" fill="currentColor" opacity="0.3" />
      <rect x="11.5" y="9.5" width="18" height="18" rx="4.5" fill="currentColor" />
      <rect x="11.5" y="9.5" width="18" height="5" rx="2.5" fill="currentColor" />
      <path
        d="M16 20.5h9M16 24h5.5"
        stroke="var(--primary-foreground)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span className="text-base">{brand.name}</span>
    </span>
  );
}
