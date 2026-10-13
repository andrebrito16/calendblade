import { describe, expect, it } from "vitest";
import { CONSENT_VERSION, parseConsent, serializeConsent } from "./consent";

describe("consent cookie", () => {
  it("round-trips the visitor's choice", () => {
    const now = new Date("2026-10-13T12:00:00Z");
    expect(parseConsent(serializeConsent({ errors: true, analytics: false }, now))).toEqual({
      version: CONSENT_VERSION,
      decidedAt: now.toISOString(),
      errors: true,
      analytics: false,
    });
  });

  it("treats missing, malformed or outdated cookies as no decision", () => {
    expect(parseConsent(undefined)).toBeNull();
    expect(parseConsent("not-json")).toBeNull();
    expect(
      parseConsent(encodeURIComponent(JSON.stringify({ version: 0, decidedAt: "x", errors: true }))),
    ).toBeNull();
  });

  it("only grants categories explicitly set to true", () => {
    const raw = encodeURIComponent(
      JSON.stringify({ version: CONSENT_VERSION, decidedAt: "x", errors: "yes" }),
    );
    expect(parseConsent(raw)).toMatchObject({ errors: false, analytics: false });
  });
});
