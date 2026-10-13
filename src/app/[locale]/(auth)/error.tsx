"use client";

import { ErrorView } from "@/components/shared/error-view";

export default function ErrorBoundary(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView {...props} />;
}
