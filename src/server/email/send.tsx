import "server-only";
import { render, toPlainText } from "@react-email/render";
import { eq } from "drizzle-orm";
import { brand } from "@/lib/brand";
import { db } from "@/server/db";
import { emailLog } from "@/server/db/schema";
import { getServerTranslator, resolveLocale } from "@/server/i18n/messages";
import { log } from "@/server/log";
import { type TemplateName, type TemplateProps, templates } from "./templates";
import { ActionEmail } from "./templates/layout";
import { getTransport } from "./transport";

type SendEmailInput<K extends TemplateName> = {
  to: string;
  template: K;
  props: TemplateProps[K];
  locale?: string | null;
  userId?: string;
  /**
   * Lifecycle emails pass a key (e.g. `trial-ending:<userId>`); a second send
   * with the same key is skipped. Recorded in `email_log`.
   */
  idempotencyKey?: string;
};

export async function renderEmail<K extends TemplateName>(
  template: K,
  props: TemplateProps[K],
  locale?: string | null,
) {
  const resolved = resolveLocale(locale);
  const t = getServerTranslator(resolved);
  const content = templates[template](t, brand.name, props);
  const footer = [
    t("emails.footer", { brand: brand.name }),
    brand.legalAddress
      ? t("emails.footerAddress", {
          entity: brand.legalEntityName,
          address: brand.legalAddress,
        })
      : null,
  ]
    .filter(Boolean)
    .join(" ");
  const html = await render(
    <ActionEmail
      lang={resolved}
      brandName={brand.name}
      preview={content.preview}
      heading={content.heading}
      paragraphs={content.paragraphs}
      cta={content.cta}
      note={content.note}
      footer={footer}
      signature={t("emails.signature", { brand: brand.name })}
    />,
  );
  return { subject: content.subject, html, text: toPlainText(html) };
}

/** Returns true when the email was sent, false when skipped as a duplicate. */
export async function sendEmail<K extends TemplateName>(input: SendEmailInput<K>): Promise<boolean> {
  if (input.idempotencyKey) {
    const inserted = await db
      .insert(emailLog)
      .values({
        idempotencyKey: input.idempotencyKey,
        template: input.template,
        userId: input.userId,
      })
      .onConflictDoNothing()
      .returning({ id: emailLog.id });
    if (inserted.length === 0) {
      log.info("email.skipped_duplicate", {
        template: input.template,
        key: input.idempotencyKey,
      });
      return false;
    }
  }

  const { subject, html, text } = await renderEmail(input.template, input.props, input.locale);
  try {
    await getTransport().send({
      to: input.to,
      subject,
      html,
      text,
      idempotencyKey: input.idempotencyKey,
    });
  } catch (error) {
    // Free the idempotency slot so a later attempt can retry.
    if (input.idempotencyKey) {
      await db.delete(emailLog).where(eq(emailLog.idempotencyKey, input.idempotencyKey));
    }
    throw error;
  }
  log.info("email.sent", { template: input.template, userId: input.userId });
  return true;
}
