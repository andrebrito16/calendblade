import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { env } from "@/server/env";

export const NONCE_COOKIE = "cb_connect_nonce";
const key = () => new TextEncoder().encode(env.CONNECTION_STATE_SECRET);

export type ConnectState = {
  userId: string;
  nonce: string;
  provider: "google" | "fixture";
  returnTo: string | null;
  reconnectId: string | null;
};

/** Signed OAuth `state` (HS256, 10 minutes), bound to a nonce cookie. */
export async function signConnectState(state: ConnectState) {
  return new SignJWT({ ...state })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key());
}

export async function verifyConnectState(token: string): Promise<ConnectState | null> {
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload as unknown as ConnectState;
  } catch {
    return null;
  }
}

/** Only same-origin relative paths are accepted as post-connect destinations. */
export function safeReturnTo(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return null;
  }
  return value;
}
