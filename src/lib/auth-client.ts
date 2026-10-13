"use client";

import { stripeClient } from "@better-auth/stripe/client";
import { magicLinkClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/** Browser auth client: sign-in forms, sign-out and Stripe checkout/portal. */
export const authClient = createAuthClient({
  plugins: [magicLinkClient(), stripeClient({ subscription: true })],
});
