import { pino, type DestinationStream, type Logger } from "pino";

/**
 * Case facts and client PII must never reach logs in plaintext. Request bodies are
 * never logged by the request logger; these redaction paths are a second line of
 * defence for anything that ends up in a structured log call by mistake.
 */
const REDACT_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "body",
  "req.body",
  "*.body",
  "email",
  "*.email",
  "password",
  "*.password",
  "currentPassword",
  "*.currentPassword",
  "newPassword",
  "*.newPassword",
  "otp",
  "*.otp",
  "formFields",
  "*.formFields",
  "draftText",
  "*.draftText",
  "generatedText",
  "*.generatedText",
  "facts",
  "*.facts",
  "prompt",
  "*.prompt",
];

export function createLogger(level: string, pretty = false, destination?: DestinationStream): Logger {
  const options = {
    level,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    ...(pretty && !destination ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
  };
  return destination ? pino(options, destination) : pino(options);
}

/** "anand@example.com" -> "an***@example.com". Use whenever an email address must appear in a log line. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  return `${email.slice(0, Math.min(2, at))}***${email.slice(at)}`;
}
