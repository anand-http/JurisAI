import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import type { Logger } from "pino";
import { maskEmail } from "../../lib/logger.js";

export interface EmailProvider {
  sendOtp(email: string, code: string, ttlMinutes: number): Promise<void>;
}

function otpMessage(appName: string, code: string, ttlMinutes: number) {
  const subject = `Your ${appName} sign-in code: ${code}`;
  const text = [
    `Your ${appName} sign-in code is ${code}.`,
    `It expires in ${ttlMinutes} minutes and can be used once.`,
    "If you did not try to sign in, you can ignore this email.",
  ].join("\n\n");
  const html = `<p>Your ${appName} sign-in code is</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p>
<p>It expires in ${ttlMinutes} minutes and can be used once.</p>
<p style="color:#666">If you did not try to sign in, you can ignore this email.</p>`;
  return { subject, text, html };
}

/**
 * Development only (config refuses it when NODE_ENV=production): prints the code to the
 * server log so sign-in works without an email service.
 */
export class ConsoleEmailProvider implements EmailProvider {
  constructor(private readonly logger: Logger) {}

  async sendOtp(email: string, code: string): Promise<void> {
    this.logger.warn(`[dev email] sign-in code for ${maskEmail(email)} is ${code}`);
  }
}

/** Amazon SES. The sender address (or its domain) must be verified in SES for the region. */
export class SesEmailProvider implements EmailProvider {
  private readonly ses: SESv2Client;

  constructor(
    region: string,
    private readonly from: string,
    private readonly appName: string,
  ) {
    this.ses = new SESv2Client({ region });
  }

  async sendOtp(email: string, code: string, ttlMinutes: number): Promise<void> {
    const { subject, text, html } = otpMessage(this.appName, code, ttlMinutes);
    await this.ses.send(
      new SendEmailCommand({
        FromEmailAddress: this.from,
        Destination: { ToAddresses: [email] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: "UTF-8" },
            Body: { Text: { Data: text, Charset: "UTF-8" }, Html: { Data: html, Charset: "UTF-8" } },
          },
        },
      }),
    );
  }
}
