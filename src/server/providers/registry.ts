import "server-only";
import { env } from "@/server/env";
import { fixtureProvider } from "./fixture/adapter";
import { googleProvider } from "./google/adapter";
import type { CalendarProvider, ProviderId } from "./types";

export function getProvider(id: ProviderId): CalendarProvider {
  if (id === "fixture") {
    if (!env.PROVIDER_FIXTURE) throw new Error("The fixture provider is disabled");
    return fixtureProvider;
  }
  return googleProvider;
}

/** Providers the user can connect on this instance. */
export function availableProviders(): ProviderId[] {
  const providers: ProviderId[] = [];
  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) providers.push("google");
  if (env.PROVIDER_FIXTURE) providers.push("fixture");
  return providers;
}
