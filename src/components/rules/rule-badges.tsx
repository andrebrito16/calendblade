import { EyeOff, FileText } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { ruleStatusStyle, StatusBadge } from "@/components/shared/status-badge";

export async function RuleStatusBadge({
  locale,
  status,
}: {
  locale: string;
  status: "active" | "paused" | "error" | "deleting";
}) {
  const t = await getTranslations({ locale, namespace: "rules" });
  const style = ruleStatusStyle[status];
  const label = {
    active: t("statusActive"),
    paused: t("statusPaused"),
    error: t("statusError"),
    deleting: t("statusDeleting"),
  }[status];
  return <StatusBadge tone={style.tone} icon={style.icon} label={label} spin={false} />;
}

export async function RuleModeBadge({ locale, mode }: { locale: string; mode: "full" | "busy" }) {
  const t = await getTranslations({ locale, namespace: "rules" });
  return mode === "full" ? (
    <StatusBadge tone="info" icon={FileText} label={t("modeFull")} />
  ) : (
    <StatusBadge tone="neutral" icon={EyeOff} label={t("modeBusy")} />
  );
}
