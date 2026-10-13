import { ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import { cacheLife } from "next/cache";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { PlanCard } from "@/components/marketing/plan-card";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { planFeatures } from "@/lib/plan-features";
import { planList, plans } from "@/lib/plans";
import { env } from "@/server/env";

export async function generateMetadata({ params }: PageProps<"/[locale]/pricing">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing" });
  return { title: t("title"), description: t("subtitle") };
}

export default async function PricingPage({ params }: PageProps<"/[locale]/pricing">) {
  "use cache";
  cacheLife("days");
  if (!env.BILLING_ENABLED) notFound();
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing" });
  const common = await getTranslations({ locale, namespace: "common" });
  const format = await getFormatter({ locale });
  const price = (value: number) => format.number(value, { style: "currency", currency: "USD" });

  const rows: [string, string, string][] = [
    [t("connectedCalendars"), String(plans.pro.maxCalendars), String(plans.max.maxCalendars)],
    [t("syncRules"), String(plans.pro.maxRules), common("unlimited")],
  ];
  const shared = [t("syncModes"), t("pushUpdates"), t("filters")];

  return (
    <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-24">
      <div className="mx-auto max-w-2xl space-y-4 text-center">
        <h1 className="text-4xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-lg text-muted-foreground text-pretty">{t("subtitle")}</p>
      </div>

      <div className="mx-auto mt-12 grid max-w-3xl gap-6 md:grid-cols-2">
        {planList.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            name={t(plan.id)}
            tagline={t(`${plan.id}Tagline`)}
            price={price(plan.priceUsd)}
            perMonth={common("perMonth")}
            features={planFeatures(plan, (key, values) => t(key as "calendars", values as { count: number }))}
            highlight={plan.id === "max"}
            highlightLabel={t("popular")}
            action={
              <Button asChild className="w-full" variant={plan.id === "max" ? "default" : "outline"}>
                <Link href="/sign-in">
                  {t("cta")} <ArrowRight />
                </Link>
              </Button>
            }
          />
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground">{t("priceNote")}</p>

      <section className="mx-auto mt-16 max-w-3xl rounded-2xl border bg-muted/30 p-6 sm:p-8">
        <h2 className="text-lg font-semibold">{t("trialExplainerTitle")}</h2>
        <ol className="mt-4 space-y-3 text-sm">
          {[t("trialExplainer1"), t("trialExplainer2"), t("trialExplainer3")].map((item, index) => (
            <li key={item} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {index + 1}
              </span>
              <span className="pt-0.5">{item}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto mt-16 max-w-3xl">
        <h2 className="mb-4 text-lg font-semibold">{t("compareTitle")}</h2>
        <div className="overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t("feature")}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t("pro")}
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  {t("max")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(([label, pro, max]) => (
                <tr key={label}>
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    {label}
                  </th>
                  <td className="px-4 py-3 tabular-nums">{pro}</td>
                  <td className="px-4 py-3 tabular-nums">{max}</td>
                </tr>
              ))}
              {shared.map((label) => (
                <tr key={label}>
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    {label}
                  </th>
                  {[0, 1].map((column) => (
                    <td key={column} className="px-4 py-3">
                      <Check className="size-4 text-primary" aria-hidden="true" />
                      <span className="sr-only">{t("included")}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
