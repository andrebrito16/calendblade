import { getFormatter, getTranslations } from "next-intl/server";
import { CookieSettingsButton } from "@/components/consent/cookie-settings-button";
import { brand } from "@/lib/brand";

type Section = { title: string; paragraphs: string[] };
type CookieRow = { name: string; provider: string; purpose: string; duration: string; category: string };
type Kind = "privacy" | "terms" | "cookies";

const placeholders: Record<string, string> = {
  brand: brand.name,
  entity: brand.legalEntityName,
  email: brand.supportEmail,
  privacyEmail: brand.privacyEmail,
  address: brand.legalAddress,
  dpo: brand.dpoName,
  euRep: brand.euRepresentative,
  jurisdiction: brand.legalJurisdiction || `the country where ${brand.legalEntityName} is established`,
};

/** Fills operator details; returns null when an optional detail is not configured. */
function fill(text: string): string | null {
  let missing = false;
  const result = text.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = placeholders[key];
    if (value === undefined) return match;
    if (value === "") missing = true;
    return value;
  });
  return missing ? null : result;
}

const titleKey = { privacy: "privacyTitle", terms: "termsTitle", cookies: "cookiesTitle" } as const;
const introKey = { privacy: "privacyIntro", terms: "termsIntro", cookies: "cookiesIntro" } as const;
const sectionsKey = {
  privacy: "privacySections",
  terms: "termsSections",
  cookies: "cookiesSections",
} as const;

/** Renders a legal document from messages, with operator identity from env. */
export async function LegalDocument({ locale, kind }: { locale: string; kind: Kind }) {
  const t = await getTranslations({ locale, namespace: "legal" });
  const format = await getFormatter({ locale });
  const sections = (t.raw(sectionsKey[kind]) as Section[])
    .map((section) => ({
      title: fill(section.title) ?? section.title,
      paragraphs: section.paragraphs.map(fill).filter((paragraph): paragraph is string => paragraph !== null),
    }))
    .filter((section) => section.paragraphs.length > 0);
  const intro = fill(t.raw(introKey[kind]) as string);
  const effective = new Date(`${t("effectiveDate")}T00:00:00Z`);
  const table =
    kind === "cookies" ? (t.raw("cookieTable") as Record<string, string> & { rows: CookieRow[] }) : null;

  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
      <header className="mb-10 space-y-2 border-b pb-8">
        <h1 className="text-3xl font-semibold tracking-tight">{t(titleKey[kind])}</h1>
        <p className="text-sm text-muted-foreground">
          {t("lastUpdated", { date: format.dateTime(effective, { dateStyle: "long", timeZone: "UTC" }) })}
        </p>
      </header>
      {intro ? <p className="mb-10 leading-7">{intro}</p> : null}

      {table ? (
        <section className="mb-10 space-y-4">
          <h2 className="text-lg font-semibold">{table.heading}</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  {(["name", "provider", "purpose", "duration", "category"] as const).map((column) => (
                    <th key={column} scope="col" className="px-4 py-3 font-medium">
                      {table[column]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y align-top">
                {table.rows.map((row) => (
                  <tr key={row.name}>
                    <th scope="row" className="px-4 py-3 font-mono text-xs font-normal">
                      {row.name}
                    </th>
                    <td className="px-4 py-3">{fill(row.provider)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row.purpose}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{row.duration}</td>
                    <td className="px-4 py-3">{row.category}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CookieSettingsButton className="text-sm font-medium text-primary underline underline-offset-4" />
        </section>
      ) : null}

      <div className="space-y-10">
        {sections.map((section, index) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-lg font-semibold">
              {index + 1}. {section.title}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="leading-7 text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
      <footer className="mt-12 space-y-1 border-t pt-8 text-sm text-muted-foreground">
        <p>{t("contactLine", { privacyEmail: brand.privacyEmail })}</p>
        <p>{[brand.legalEntityName, brand.legalAddress].filter(Boolean).join(" · ")}</p>
      </footer>
    </article>
  );
}
