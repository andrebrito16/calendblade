import "server-only";
import type { getServerTranslator } from "@/server/i18n/messages";

type T = ReturnType<typeof getServerTranslator>;

export type EmailContent = {
  subject: string;
  preview: string;
  heading: string;
  paragraphs: string[];
  cta?: { label: string; url: string };
  note?: string;
};

export type TemplateProps = {
  "magic-link": { url: string };
  welcome: { name: string; url: string };
  "connection-needs-reauth": { email: string; url: string };
  "rule-error": { source: string; target: string; reason: string; url: string };
  "trial-converting-3d": { plan: string; date: string; price: string; url: string };
  "payment-failed": { url: string };
  "subscription-paused": { date: string; url: string };
  "data-deletion-7d": { date: string; url: string };
  "subscription-confirmed": { plan: string; url: string };
};

export type TemplateName = keyof TemplateProps;

type Builders = {
  [K in TemplateName]: (t: T, brand: string, props: TemplateProps[K]) => EmailContent;
};

export const templates: Builders = {
  "magic-link": (t, brand, { url }) => ({
    subject: t("emails.magicLink.subject", { brand }),
    preview: t("emails.magicLink.preview", { brand }),
    heading: t("emails.magicLink.heading", { brand }),
    paragraphs: [t("emails.magicLink.body")],
    cta: { label: t("emails.magicLink.cta"), url },
    note: t("emails.magicLink.ignore"),
  }),
  welcome: (t, brand, { name, url }) => ({
    subject: t("emails.welcome.subject", { brand }),
    preview: t("emails.welcome.preview"),
    heading: t("emails.welcome.heading", { name }),
    paragraphs: [t("emails.welcome.body")],
    cta: { label: t("emails.welcome.cta", { brand }), url },
  }),
  "connection-needs-reauth": (t, brand, { email, url }) => ({
    subject: t("emails.connectionNeedsReauth.subject", { email }),
    preview: t("emails.connectionNeedsReauth.preview", { email }),
    heading: t("emails.connectionNeedsReauth.heading", { email }),
    paragraphs: [t("emails.connectionNeedsReauth.body", { brand, email })],
    cta: { label: t("emails.connectionNeedsReauth.cta"), url },
  }),
  "rule-error": (t, _brand, { source, target, reason, url }) => ({
    subject: t("emails.ruleError.subject"),
    preview: t("emails.ruleError.preview", { source, target }),
    heading: t("emails.ruleError.heading"),
    paragraphs: [t("emails.ruleError.body", { source, target, reason })],
    cta: { label: t("emails.ruleError.cta"), url },
  }),
  "trial-converting-3d": (t, brand, { plan, date, price, url }) => ({
    subject: t("emails.trialConverting.subject", { brand }),
    preview: t("emails.trialConverting.preview", { plan, date }),
    heading: t("emails.trialConverting.heading", { date }),
    paragraphs: [t("emails.trialConverting.body", { plan, date, price })],
    cta: { label: t("emails.trialConverting.cta"), url },
  }),
  "payment-failed": (t, brand, { url }) => ({
    subject: t("emails.paymentFailed.subject", { brand }),
    preview: t("emails.paymentFailed.preview"),
    heading: t("emails.paymentFailed.heading"),
    paragraphs: [t("emails.paymentFailed.body", { brand })],
    cta: { label: t("emails.paymentFailed.cta"), url },
  }),
  "subscription-paused": (t, brand, { date, url }) => ({
    subject: t("emails.subscriptionPaused.subject"),
    preview: t("emails.subscriptionPaused.preview", { brand }),
    heading: t("emails.subscriptionPaused.heading"),
    paragraphs: [t("emails.subscriptionPaused.body", { date })],
    cta: { label: t("emails.subscriptionPaused.cta"), url },
  }),
  "data-deletion-7d": (t, brand, { date, url }) => ({
    subject: t("emails.dataDeletion.subject", { brand }),
    preview: t("emails.dataDeletion.preview", { date }),
    heading: t("emails.dataDeletion.heading", { date }),
    paragraphs: [t("emails.dataDeletion.body", { date })],
    cta: { label: t("emails.dataDeletion.cta"), url },
  }),
  "subscription-confirmed": (t, brand, { plan, url }) => ({
    subject: t("emails.subscriptionConfirmed.subject", { brand, plan }),
    preview: t("emails.subscriptionConfirmed.preview"),
    heading: t("emails.subscriptionConfirmed.heading"),
    paragraphs: [t("emails.subscriptionConfirmed.body", { plan })],
    cta: { label: t("emails.subscriptionConfirmed.cta", { brand }), url },
  }),
};
