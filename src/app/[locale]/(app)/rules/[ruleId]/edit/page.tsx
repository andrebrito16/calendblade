import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { RuleForm } from "@/components/rules/rule-form";
import { RuleRoute } from "@/components/rules/rule-route";
import { PageHeader } from "@/components/shared/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getRule } from "@/server/queries/rules";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/rules/[ruleId]/edit">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "rules" });
  return { title: t("editRule") };
}

async function EditRule({ params }: { params: PageProps<"/[locale]/rules/[ruleId]/edit">["params"] }) {
  const { ruleId } = await params;
  const rule = await getRule(ruleId);
  if (!rule || rule.status === "deleting") notFound();
  const settings = rule.settings;
  return (
    <RuleForm
      mode="edit"
      ruleId={rule.id}
      targetName={rule.target.name}
      fixedRoute={<RuleRoute rule={rule} />}
      initial={{
        mode: settings.mode,
        busyTitle: settings.busyTitle ?? "",
        titlePrefix: settings.titlePrefix ?? "",
        colorId: settings.colorId ?? "",
        includeAllDay: settings.includeAllDay,
        includeDeclined: settings.includeDeclined,
        includeTentative: settings.includeTentative,
        includePrivate: settings.includePrivate,
        pastDays: settings.pastDays,
        futureDays: settings.futureDays,
      }}
    />
  );
}

export default async function EditRulePage({ params }: PageProps<"/[locale]/rules/[ruleId]/edit">) {
  const t = await getTranslations("rules");
  return (
    <div className="space-y-8">
      <PageHeader title={t("editRule")} />
      <Suspense fallback={<Skeleton className="h-96 rounded-xl" />}>
        <EditRule params={params} />
      </Suspense>
    </div>
  );
}
