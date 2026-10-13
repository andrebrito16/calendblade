"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { usePathname, useRouter } from "@/i18n/navigation";
import { brand } from "@/lib/brand";

/** Turns `?connected=` / `?error=` from the OAuth callback into a toast once. */
export function ConnectionFeedback({ connected, error }: { connected: string | null; error: string | null }) {
  const t = useTranslations("connections");
  const router = useRouter();
  const pathname = usePathname();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current || (!connected && !error)) return;
    shown.current = true;
    if (connected) toast.success(t("connectedToast", { email: connected }));
    if (error === "no_refresh_token") toast.error(t("noRefreshToken", { brand: brand.name }));
    else if (error) toast.error(t("connectError"));
    router.replace(pathname, { scroll: false });
  }, [connected, error, pathname, router, t]);

  return null;
}
