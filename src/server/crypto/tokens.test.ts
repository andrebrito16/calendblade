import { describe, expect, it } from "vitest";
import { decryptToken, encryptToken } from "./tokens";

describe("token encryption", () => {
  it("round-trips with a versioned AES-256-GCM payload", () => {
    const encrypted = encryptToken("ya29.secret-access-token");
    expect(encrypted.startsWith("v1:")).toBe(true);
    expect(encrypted.split(":")).toHaveLength(4);
    expect(encrypted).not.toContain("secret");
    expect(decryptToken(encrypted)).toBe("ya29.secret-access-token");
  });

  it("uses a fresh IV for every encryption", () => {
    expect(encryptToken("same")).not.toBe(encryptToken("same"));
  });

  it("rejects tampered ciphertext", () => {
    const [version, iv, ciphertext, tag] = encryptToken("token").split(":");
    const flipped = Buffer.from(ciphertext ?? "", "base64url");
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(() => decryptToken([version, iv, flipped.toString("base64url"), tag].join(":"))).toThrow();
  });

  it("rejects a different key", () => {
    const other = Buffer.alloc(32, 9).toString("base64");
    expect(() => decryptToken(encryptToken("token"), other)).toThrow();
  });

  it("rejects unknown versions and malformed payloads", () => {
    expect(() => decryptToken("v9:a:b:c")).toThrow(/version/);
    expect(() => decryptToken("garbage")).toThrow(/Malformed/);
  });
});
