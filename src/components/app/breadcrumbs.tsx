"use client";

import { useTranslations } from "next-intl";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Link, usePathname } from "@/i18n/navigation";

const sections = {
  dashboard: "dashboard",
  connections: "connections",
  rules: "rules",
  activity: "activity",
  settings: "settings",
  onboarding: "onboarding",
} as const;

/** Section-level breadcrumb derived from the URL; detail pages show their own title. */
export function Breadcrumbs({
  detailLabels,
}: {
  detailLabels: { new: string; edit: string; billing: string; detail: string };
}) {
  const t = useTranslations("nav");
  const segments = usePathname().split("/").filter(Boolean);
  const section = segments[0] as keyof typeof sections | undefined;
  if (!section || !(section in sections)) return null;

  const crumbs: { href?: string; label: string }[] = [{ href: `/${section}`, label: t(sections[section]) }];
  const rest = segments.slice(1);
  if (rest[0] === "new") crumbs.push({ label: detailLabels.new });
  else if (rest[0] === "billing") crumbs.push({ label: detailLabels.billing });
  else if (rest[0]) {
    crumbs.push({ href: rest[1] ? `/${section}/${rest[0]}` : undefined, label: detailLabels.detail });
    if (rest[1] === "edit") crumbs.push({ label: detailLabels.edit });
  }

  return (
    <Breadcrumb aria-label={t("breadcrumb")}>
      <BreadcrumbList>
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <Fragment key={`${crumb.label}-${index}`}>
              <BreadcrumbItem
                className={index === 0 && crumbs.length > 1 ? "hidden sm:inline-flex" : undefined}
              >
                {last || !crumb.href ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {last ? null : <BreadcrumbSeparator className={index === 0 ? "hidden sm:block" : undefined} />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
