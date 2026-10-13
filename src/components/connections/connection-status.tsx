import { getTranslations } from "next-intl/server";
import { connectionStatusStyle, StatusBadge } from "@/components/shared/status-badge";

export async function ConnectionStatusBadge({
  locale,
  status,
}: {
  locale: string;
  status: "active" | "needs_reauth" | "revoked";
}) {
  const t = await getTranslations({ locale, namespace: "connections" });
  const style = connectionStatusStyle[status];
  const label =
    status === "active"
      ? t("statusActive")
      : status === "needs_reauth"
        ? t("statusNeedsReauth")
        : t("statusRevoked");
  return <StatusBadge tone={style.tone} icon={style.icon} label={label} />;
}
