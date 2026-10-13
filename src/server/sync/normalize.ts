import type { GoogleEvent } from "../providers/google/types";
import { type NormalizedEvent, ORIGIN_KEY, type ResponseStatus, SOURCE_KEY } from "../providers/types";

/** Google event → provider-agnostic event. Pure. */
export function normalizeGoogleEvent(event: GoogleEvent): NormalizedEvent {
  const self = event.attendees?.find((attendee) => attendee.self);
  const privateProps = event.extendedProperties?.private ?? {};
  const originRule = privateProps[ORIGIN_KEY];
  const start = event.start ?? {};
  const end = event.end ?? {};

  return {
    id: event.id,
    icalUid: event.iCalUID,
    etag: event.etag,
    status: event.status ?? "confirmed",
    title: event.summary ?? "",
    description: event.description,
    location: event.location,
    start: { date: start.date, dateTime: start.dateTime, timeZone: start.timeZone },
    end: { date: end.date, dateTime: end.dateTime, timeZone: end.timeZone },
    allDay: Boolean(start.date && !start.dateTime),
    transparency: event.transparency ?? "opaque",
    visibility: event.visibility ?? "default",
    selfResponse: (self?.responseStatus as ResponseStatus | undefined) ?? null,
    attendees: (event.attendees ?? [])
      .filter((attendee) => attendee.email && !attendee.resource && !attendee.self)
      .map((attendee) => ({
        email: attendee.email as string,
        name: attendee.displayName,
        response: (attendee.responseStatus ?? "needsAction") as ResponseStatus,
      })),
    recurrence: event.recurrence,
    recurringEventId: event.recurringEventId,
    originalStartTime: event.originalStartTime,
    organizerIsSelf: event.organizer?.self ?? false,
    origin: originRule
      ? {
          app: "calendblade",
          ruleId: originRule,
          sourceEventId: privateProps[SOURCE_KEY],
        }
      : null,
  };
}
