import { ArrowLeftRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

type Block = {
  top: number;
  height: number;
  title: string;
  time: string;
  mirrored?: boolean;
  tone: "indigo" | "cyan";
  /** Entrance delay in ms: originals land first, then their mirrors wipe in. */
  delay: number;
};

function Column({
  name,
  color,
  side,
  blocks,
}: {
  name: string;
  color: string;
  side: "left" | "right";
  blocks: Block[];
}) {
  return (
    <div
      className="marketing-pop min-w-0 flex-1 rounded-xl border bg-card p-3 shadow-sm"
      style={{ animationDelay: side === "left" ? "150ms" : "210ms" }}
    >
      <div className="mb-3 flex items-center gap-2 text-sm font-medium">
        <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
        {name}
      </div>
      <div className="relative h-64 overflow-hidden rounded-lg bg-muted/40">
        {[0, 1, 2, 3, 4, 5].map((line) => (
          <div
            key={line}
            className="absolute inset-x-0 border-t border-border/60"
            style={{ top: `${line * 20}%` }}
          />
        ))}
        {blocks.map((block) => (
          <div
            key={block.title + block.time}
            className={cn(
              "absolute inset-x-2 rounded-md px-2 py-1.5 text-xs leading-tight",
              // A mirror arrives from the other calendar, so it wipes in from that side.
              block.mirrored
                ? side === "left"
                  ? "marketing-wipe-from-right"
                  : "marketing-wipe-from-left"
                : "marketing-pop",
              block.mirrored
                ? "border border-dashed border-foreground/25 bg-foreground/[0.06] text-foreground/80"
                : block.tone === "indigo"
                  ? "bg-indigo-600 text-white"
                  : "bg-cyan-700 text-white",
            )}
            style={{ top: `${block.top}%`, height: `${block.height}%`, animationDelay: `${block.delay}ms` }}
          >
            <div className="flex items-center gap-1 font-medium">
              {block.mirrored ? <Lock className="size-3" aria-hidden="true" /> : null}
              <span className="truncate">{block.title}</span>
            </div>
            <div className={block.mirrored ? "opacity-80" : undefined}>{block.time}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Decorative hero illustration: two calendars mirroring each other. */
export function MirrorPreview({
  labels,
}: {
  labels: {
    work: string;
    personal: string;
    standup: string;
    dentist: string;
    busy: string;
    mirrored: string;
  };
}) {
  return (
    <figure className="relative mx-auto w-full max-w-xl" aria-label={labels.mirrored}>
      <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-primary/15 via-transparent to-cyan-500/10 blur-2xl" />
      <div className="flex items-stretch gap-3">
        <Column
          name={labels.work}
          color="#6366f1"
          side="left"
          blocks={[
            { top: 6, height: 14, title: labels.standup, time: "9:30 – 9:45", tone: "indigo", delay: 500 },
            {
              top: 46,
              height: 22,
              title: labels.busy,
              time: "1:00 – 2:00",
              mirrored: true,
              tone: "indigo",
              delay: 1150,
            },
          ]}
        />
        <div className="flex flex-col items-center justify-center">
          <span
            className="marketing-pop flex size-9 items-center justify-center rounded-full border bg-background text-primary shadow-sm"
            style={{ animationDelay: "400ms" }}
          >
            <ArrowLeftRight className="size-4" aria-hidden="true" />
          </span>
        </div>
        <Column
          name={labels.personal}
          color="#0891b2"
          side="right"
          blocks={[
            {
              top: 6,
              height: 14,
              title: labels.busy,
              time: "9:30 – 9:45",
              mirrored: true,
              tone: "cyan",
              delay: 1000,
            },
            { top: 46, height: 22, title: labels.dentist, time: "1:00 – 2:00", tone: "cyan", delay: 620 },
          ]}
        />
      </div>
      <figcaption className="mt-3 text-center text-xs text-muted-foreground">{labels.mirrored}</figcaption>
    </figure>
  );
}
