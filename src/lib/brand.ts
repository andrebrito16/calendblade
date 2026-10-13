/**
 * Brand and legal identity. Forks rebrand through env without touching
 * components. NEXT_PUBLIC_ so the values are available on both sides.
 * Optional legal fields left empty are omitted from the legal documents.
 */
const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com";

export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Calendblade",
  supportEmail,
  /** Contact for privacy requests and the DPO / Encarregado (LGPD). */
  privacyEmail: process.env.NEXT_PUBLIC_PRIVACY_EMAIL || supportEmail,
  legalEntityName: process.env.NEXT_PUBLIC_LEGAL_ENTITY_NAME || "The Calendblade operators",
  legalAddress: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "",
  /** Data Protection Officer / Encarregado name (LGPD Art. 41). */
  dpoName: process.env.NEXT_PUBLIC_DPO_NAME || "",
  /** EU representative (GDPR Art. 27), when the operator has no EU establishment. */
  euRepresentative: process.env.NEXT_PUBLIC_EU_REPRESENTATIVE || "",
  /** Governing law for the terms, e.g. "Brazil" or "Portugal". */
  legalJurisdiction: process.env.NEXT_PUBLIC_LEGAL_JURISDICTION || "",
  repositoryUrl: process.env.NEXT_PUBLIC_REPOSITORY_URL || "https://github.com/andrebrito16/calendblade",
} as const;
