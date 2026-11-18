import { createTransport, type Transporter } from "nodemailer";

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface Mailer {
  send(msg: MailMessage): Promise<void>;
}

export class SmtpMailer implements Mailer {
  private transport: Transporter;
  constructor(
    smtpUrl: string,
    private from: string,
  ) {
    this.transport = createTransport(smtpUrl);
  }
  async send(msg: MailMessage): Promise<void> {
    await this.transport.sendMail({ from: this.from, to: msg.to, subject: msg.subject, html: msg.html, text: msg.text });
  }
}

/** Test/inspection mailer: keeps messages in memory. */
export class MemoryMailer implements Mailer {
  messages: MailMessage[] = [];
  async send(msg: MailMessage): Promise<void> {
    this.messages.push(msg);
  }
  lastTo(to: string): MailMessage | undefined {
    return [...this.messages].reverse().find((m) => m.to === to);
  }
}
