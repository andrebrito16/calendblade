"use client";

import type { ReactNode } from "react";
import { usePathname } from "@/i18n/navigation";

export function HideOnPaths({ paths, children }: { paths: string[]; children: ReactNode }) {
  const pathname = usePathname();
  if (paths.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;
  return children;
}
