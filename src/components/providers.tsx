"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { ConsentProvider } from "@/components/consent/consent-provider";
import { InputModality } from "@/components/input-modality";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={200}>
        <InputModality />
        <ConsentProvider>{children}</ConsentProvider>
        <Toaster position="bottom-right" richColors closeButton />
      </TooltipProvider>
    </ThemeProvider>
  );
}
