import { getFormatter } from "next-intl/server";

/** Relative time with the absolute date/time (in the user's zone) on hover. */
export async function RelativeTime({
  date,
  locale,
  timeZone,
  now,
}: {
  date: Date;
  locale: string;
  timeZone: string;
  now: Date;
}) {
  const format = await getFormatter({ locale });
  return (
    <time
      dateTime={date.toISOString()}
      title={format.dateTime(date, { dateStyle: "medium", timeStyle: "short", timeZone })}
    >
      {format.relativeTime(date, now)}
    </time>
  );
}

export function formatDuration(ms: number) {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
}
