import {
  ArrowLeftRight,
  ArrowRight,
  CalendarPlus,
  Check,
  EyeOff,
  FileLock2,
  GitBranch,
  type LucideIcon,
  MailX,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { cacheLife } from "next/cache";
import { getFormatter, getTranslations } from "next-intl/server";
import { MirrorPreview } from "@/components/marketing/mirror-preview";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { brand } from "@/lib/brand";
import { planList } from "@/lib/plans";
import { env } from "@/server/env";

function Feature({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-6">
      <div className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

export default async function LandingPage({ params }: PageProps<"/[locale]">) {
  "use cache";
  cacheLife("days");
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "marketing" });
  const common = await getTranslations({ locale, namespace: "common" });
  const format = await getFormatter({ locale });
  const billing = env.BILLING_ENABLED;
  const lowestPrice = Math.min(...planList.map((plan) => plan.priceUsd));

  return (
    <>
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full border bg-accent/60 px-3 py-1 text-xs font-medium text-accent-foreground">
              <Sparkles className="size-3.5" aria-hidden="true" />
              {t("hero.eyebrow")}
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground text-pretty">{t("hero.subtitle")}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/sign-in">
                  {billing ? t("hero.primaryCta") : t("hero.primaryCtaSelfHost")} <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/#how">{t("hero.secondaryCta")}</Link>
              </Button>
            </div>
            {billing ? <p className="text-sm text-muted-foreground">{t("hero.trialNote")}</p> : null}
          </div>
          <MirrorPreview
            labels={{
              work: t("preview.work"),
              personal: t("preview.personal"),
              standup: t("preview.standup"),
              dentist: t("preview.dentist"),
              busy: t("preview.busy"),
              mirrored: t("preview.mirrored", { brand: brand.name }),
            }}
          />
        </div>
      </section>

      <section id="how" className="scroll-mt-20 border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto mb-12 max-w-2xl space-y-3 text-center">
            <h2 className="text-3xl font-semibold tracking-tight">{t("how.title")}</h2>
            <p className="text-muted-foreground">{t("how.subtitle")}</p>
          </div>
          <ol className="grid gap-6 md:grid-cols-3">
            {(
              [
                [CalendarPlus, "step1"],
                [Workflow, "step2"],
                [Repeat2, "step3"],
              ] as const
            ).map(([Icon, key], index) => (
              <li key={key} className="relative space-y-3 rounded-xl border bg-card p-6">
                <span className="absolute top-6 right-6 font-mono text-sm text-muted-foreground">
                  0{index + 1}
                </span>
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <Icon className="size-5" aria-hidden="true" />
                </div>
                <h3 className="font-semibold">{t(`how.${key}Title`)}</h3>
                <p className="text-sm text-muted-foreground">{t(`how.${key}Body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto mb-12 max-w-2xl space-y-3 text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">{t("modes.title")}</h2>
          <p className="text-muted-foreground">{t("modes.subtitle")}</p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          <Feature icon={FileLock2} title={t("modes.fullTitle")} body={t("modes.fullBody")} />
          <Feature icon={EyeOff} title={t("modes.busyTitle")} body={t("modes.busyBody")} />
          <Feature icon={ArrowLeftRight} title={t("modes.twoWayTitle")} body={t("modes.twoWayBody")} />
        </div>
      </section>

      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <h2 className="mb-12 text-center text-3xl font-semibold tracking-tight text-balance">
            {t("privacy.title")}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Feature icon={ShieldCheck} title={t("privacy.tokensTitle")} body={t("privacy.tokensBody")} />
            <Feature icon={EyeOff} title={t("privacy.contentTitle")} body={t("privacy.contentBody")} />
            <Feature icon={MailX} title={t("privacy.noInvitesTitle")} body={t("privacy.noInvitesBody")} />
            <Feature icon={GitBranch} title={t("privacy.openTitle")} body={t("privacy.openBody")} />
          </div>
        </div>
      </section>

      {billing ? (
        <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border bg-card p-8 md:flex-row md:items-center">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight">{t("pricingTeaser.title")}</h2>
              <p className="max-w-xl text-muted-foreground">{t("pricingTeaser.subtitle")}</p>
              <p className="flex items-center gap-2 text-sm font-medium">
                <Check className="size-4 text-success" aria-hidden="true" />
                {format.number(lowestPrice, { style: "currency", currency: "USD" })}
                {common("perMonth")}
              </p>
            </div>
            <Button asChild size="lg" variant="outline">
              <Link href="/pricing">
                {t("pricingTeaser.cta")} <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
      ) : null}

      <section id="faq" className="mx-auto max-w-3xl scroll-mt-20 px-4 py-20 sm:px-6">
        <h2 className="mb-8 text-center text-3xl font-semibold tracking-tight">{t("faq.title")}</h2>
        <div className="divide-y rounded-xl border bg-card">
          {(["1", "2", "3", "4", ...(billing ? ["5"] : []), "6"] as const).map((n) => (
            <details key={n} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-md font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {t(`faq.q${n}` as "faq.q1")}
                <span
                  aria-hidden="true"
                  className="text-muted-foreground transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="pt-3 text-sm text-muted-foreground">{t(`faq.a${n}` as "faq.a1")}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="px-4 pb-20 sm:px-6">
        <div className="mx-auto max-w-6xl rounded-2xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12">
          <h2 className="text-3xl font-semibold tracking-tight text-balance">{t("finalCta.title")}</h2>
          <p className="mx-auto mt-3 max-w-xl opacity-90">{t("finalCta.subtitle")}</p>
          <Button asChild size="lg" variant="secondary" className="mt-8">
            <Link href="/sign-in">
              {billing ? t("hero.primaryCta") : t("hero.primaryCtaSelfHost")} <ArrowRight />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
