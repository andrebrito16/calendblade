import "server-only";
import nodemailer from "nodemailer";
import { Resend } from "resend";
import { env } from "@/server/env";
import { log } from "@/server/log";

export type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey?: string;
};

export interface EmailTransport {
  send(email: OutgoingEmail): Promise<void>;
}

class ResendTransport implements EmailTransport {
  private client = new Resend(env.RESEND_API_KEY);

  async send(email: OutgoingEmail) {
    const { error } = await this.client.emails.send(
      {
        from: env.EMAIL_FROM,
        to: email.to,
        subject: email.subject,
        html: email.html,
        text: email.text,
      },
      email.idempotencyKey ? { idempotencyKey: email.idempotencyKey } : undefined,
    );
    if (error) throw new Error(`Resend: ${error.message}`);
  }
}

class SmtpTransport implements EmailTransport {
  private transporter = nodemailer.createTransport(env.SMTP_URL);

  async send(email: OutgoingEmail) {
    await this.transporter.sendMail({
      from: env.EMAIL_FROM,
      to: email.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
  }
}

/** Development only: prints the email instead of sending it. */
class LogTransport implements EmailTransport {
  async send(email: OutgoingEmail) {
    log.info("email.logged", {
      to: email.to,
      subject: email.subject,
      text: email.text,
    });
  }
}

let transport: EmailTransport | undefined;

export function getTransport(): EmailTransport {
  if (!transport) {
    transport =
      env.EMAIL_TRANSPORT === "resend"
        ? new ResendTransport()
        : env.EMAIL_TRANSPORT === "smtp"
          ? new SmtpTransport()
          : new LogTransport();
  }
  return transport;
}
