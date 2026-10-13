"use client";

import { createContext, type ReactNode, use } from "react";

export type ClientUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  timezone: string;
};

const UserContext = createContext<Promise<ClientUser> | null>(null);

/** Shares the session user with Client Components without prop drilling. */
export function UserProvider({
  userPromise,
  children,
}: {
  userPromise: Promise<ClientUser>;
  children: ReactNode;
}) {
  return <UserContext value={userPromise}>{children}</UserContext>;
}

export function useUser() {
  const promise = use(UserContext);
  if (!promise) throw new Error("useUser must be used within a UserProvider");
  return use(promise);
}
