import { FlaskConical } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { GoogleIcon } from "@/components/auth/google-icon";

export async function ProviderLabel({
  locale,
  provider,
}: {
  locale: string;
  provider: "google" | "fixture";
}) {
  const t = await getTranslations({ locale, namespace: "connections" });
  return (
    <span className="inline-flex items-center gap-1.5">
      {provider === "fixture" ? (
        <FlaskConical className="size-3.5" aria-hidden="true" />
      ) : (
        <GoogleIcon className="size-3.5" />
      )}
      {provider === "fixture" ? t("providerFixture") : t("providerGoogle")}
    </span>
  );
}
