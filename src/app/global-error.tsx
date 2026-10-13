"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Last-resort boundary when the root layout itself fails (no i18n available). */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
          textAlign: "center",
        }}
      >
        <div>
          <h1 style={{ fontSize: 20 }}>Something went wrong</h1>
          <p style={{ color: "#71717a" }}>An unexpected error occurred. Please try again.</p>
          <button
            type="button"
            onClick={reset}
            style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e4e4e7", cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
