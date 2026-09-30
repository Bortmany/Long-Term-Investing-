// Account emails: "confirm your email", "reset your password", and the short
// "you already have an account" note. Plain English, English only, no
// marketing, no tracking pixels. Sent ONLY through the shared sendEmail.
//
// GOLDEN RULE for this module: nothing ever pretends an email was sent when
// it wasn't. Every send records an honest outcome — "sent", "failed" or
// "rate_limited" — in a per-request store (AsyncLocalStorage) that the auth
// route wrapper (src/app/api/auth/[...all]/route.ts) reads after Better Auth
// has finished. Better Auth itself swallows send failures during sign-up and
// sign-in, so without this store the screen would have no way to know.
//
// Links are built from BETTER_AUTH_URL. In production, a missing or localhost
// BETTER_AUTH_URL would send people a link that can't work, so we refuse to
// send, log an error, and report "failed" so the page says so honestly.

import { AsyncLocalStorage } from "node:async_hooks";

import { escapeHtml, sendEmail, type EmailResult } from "@/lib/email/send";
import { getLegalContactEmail } from "@/lib/legal-contact";
import { logger } from "@/lib/logger";
import { EMAIL_SEND_RATE_LIMIT, emailKey, rateLimit } from "@/lib/rate-limit";

export type AuthEmailKind = "verify" | "reset" | "existing_account";

/** What honestly happened to the account email for this request. */
export type AuthEmailOutcome = "sent" | "failed" | "rate_limited";

/** Per-request memory shared between the auth route wrapper and the senders. */
export type AuthEmailStore = {
  /** The outcome of the account email sent during this request, if any. */
  outcome?: AuthEmailOutcome;
  /**
   * True when the route wrapper already counted this request against the
   * per-email hourly limit (resend and reset requests), so the sender must
   * not count it a second time.
   */
  emailSendCounted: boolean;
};

export const authEmailStore = new AsyncLocalStorage<AuthEmailStore>();

/** Where the app sends people after they click an emailed link. */
// "?confirmed=1" marks a real arrival from a confirmed link; Better Auth
// appends "&error=…" to it for a bad or expired link.
export const VERIFY_EMAIL_RESULT_PATH = "/verify-email?confirmed=1";
export const RESET_PASSWORD_PATH = "/reset-password";

type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]", "::1"]);

/**
 * The web address email links should start with, or null when there isn't a
 * usable one. Production: BETTER_AUTH_URL must be set, be http(s), and not
 * point at this machine. Elsewhere: BETTER_AUTH_URL when set, otherwise the
 * address Better Auth worked out from the request (`fallbackUrl`).
 */
export function emailLinkOrigin(env: Env, fallbackUrl?: string): string | null {
  const configured = env.BETTER_AUTH_URL?.trim();
  const parse = (value: string | undefined): URL | null => {
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:" ? url : null;
    } catch {
      return null;
    }
  };

  if (env.NODE_ENV === "production") {
    const url = parse(configured);
    if (!url || LOCAL_HOSTS.has(url.hostname)) return null;
    return url.origin;
  }
  const url = parse(configured) ?? parse(fallbackUrl);
  return url ? url.origin : null;
}

/** The confirm-your-email link. Always lands on our own result page. */
export function buildVerifyLink(origin: string, token: string): string {
  return `${origin}/api/auth/verify-email?token=${encodeURIComponent(token)}&callbackURL=${encodeURIComponent(VERIFY_EMAIL_RESULT_PATH)}`;
}

/**
 * The reset link. It goes through Better Auth's own check first, which sends
 * the person on to /reset-password?token=… (good link) or
 * /reset-password?error=INVALID_TOKEN (bad or expired link).
 */
export function buildResetLink(origin: string, token: string): string {
  return `${origin}/api/auth/reset-password/${encodeURIComponent(token)}?callbackURL=${encodeURIComponent(RESET_PASSWORD_PATH)}`;
}

export type RenderedEmail = { subject: string; text: string; html: string };

type TemplateInput = { name: string; url: string; contactEmail: string };

/** The one shared HTML frame: greeting, text, one button, the raw link. */
function renderHtml(opts: {
  greetingName: string;
  intro: string;
  buttonLabel: string;
  url: string;
  outro: string;
  contactEmail: string;
}): string {
  const name = escapeHtml(opts.greetingName);
  const url = escapeHtml(opts.url);
  const contact = escapeHtml(opts.contactEmail);
  return [
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#0f172a;max-width:480px">`,
    `<p>Hello ${name},</p>`,
    `<p>${escapeHtml(opts.intro)}</p>`,
    `<p><a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(opts.buttonLabel)}</a></p>`,
    `<p style="color:#475569">If the button doesn't work, copy this link into your browser:<br><a href="${url}" style="color:#2563eb;word-break:break-all">${url}</a></p>`,
    `<p style="color:#475569">${escapeHtml(opts.outro)}</p>`,
    `<p style="color:#475569">Questions? Contact us at <a href="mailto:${contact}" style="color:#2563eb">${contact}</a>.</p>`,
    `<p style="color:#475569">InvestIQ AI</p>`,
    `</div>`,
  ].join("");
}

function greetingName(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : "there";
}

export function buildVerifyEmail({ name, url, contactEmail }: TemplateInput): RenderedEmail {
  const intro = "Please confirm your email address to finish creating your InvestIQ account. The link works for 24 hours.";
  const outro = "If you didn't create an account, you can ignore this email.";
  return {
    subject: "Confirm your email for InvestIQ",
    text: [
      `Hello ${greetingName(name)},`,
      "",
      intro,
      "",
      url,
      "",
      outro,
      "",
      `Questions? Contact us at ${contactEmail}.`,
      "",
      "InvestIQ AI",
    ].join("\n"),
    html: renderHtml({
      greetingName: greetingName(name),
      intro,
      buttonLabel: "Confirm my email",
      url,
      outro,
      contactEmail,
    }),
  };
}

export function buildResetEmail({ name, url, contactEmail }: TemplateInput): RenderedEmail {
  const intro = "We got a request to reset your InvestIQ password. Use the link below to choose a new one. It works for 1 hour.";
  const outro = "If you didn't ask for this, ignore it. Your password hasn't changed.";
  return {
    subject: "Reset your InvestIQ password",
    text: [
      `Hello ${greetingName(name)},`,
      "",
      intro,
      "",
      url,
      "",
      outro,
      "",
      `Questions? Contact us at ${contactEmail}.`,
      "",
      "InvestIQ AI",
    ].join("\n"),
    html: renderHtml({
      greetingName: greetingName(name),
      intro,
      buttonLabel: "Choose a new password",
      url,
      outro,
      contactEmail,
    }),
  };
}

/**
 * Sent when someone tries to sign up with an address that already has a
 * confirmed account. It tells the real owner, and — because an email really
 * goes out — the sign-up screen can truthfully say "we sent you an email"
 * without revealing to the person typing whether the address is registered.
 */
export function buildExistingAccountEmail({ name, url, contactEmail }: TemplateInput): RenderedEmail {
  const intro = "Someone tried to create a new InvestIQ account with this email address, but you already have one. You can sign in with the button below. If you've forgotten your password, use \"Forgot password?\" on the sign-in page.";
  const outro = "If this wasn't you, you can ignore this email. Nothing has changed on your account.";
  return {
    subject: "You already have an InvestIQ account",
    text: [
      `Hello ${greetingName(name)},`,
      "",
      intro,
      "",
      url,
      "",
      outro,
      "",
      `Questions? Contact us at ${contactEmail}.`,
      "",
      "InvestIQ AI",
    ].join("\n"),
    html: renderHtml({
      greetingName: greetingName(name),
      intro,
      buttonLabel: "Sign in",
      url,
      outro,
      contactEmail,
    }),
  };
}

/** Report an email failure to Sentry when it's configured (never throws). */
async function reportToSentry(message: string): Promise<void> {
  if (!process.env.SENTRY_DSN) return;
  try {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureMessage(message, "error");
  } catch {
    // Sentry unavailable — the logger line is our record.
  }
}

export type SendAuthEmailInput = {
  kind: AuthEmailKind;
  to: string;
  name: string;
  /** The token for verify/reset links (ignored for existing_account). */
  token?: string;
  /** The link Better Auth built; only used to learn the origin outside production. */
  betterAuthUrl?: string;
};

export type SendAuthEmailDeps = {
  env?: Env;
  sendEmailFn?: (input: {
    to: string;
    subject: string;
    text: string;
    html: string;
  }) => Promise<EmailResult<{ id: string }>>;
};

function record(outcome: AuthEmailOutcome): AuthEmailOutcome {
  const store = authEmailStore.getStore();
  if (store) store.outcome = outcome;
  return outcome;
}

/**
 * Send one account email and record the honest outcome for this request.
 * Never throws: Better Auth would swallow a throw on sign-up anyway, and the
 * route wrapper turns a "failed" outcome into the right message for each page.
 * Never logs the email address, the token or the link.
 */
export async function sendAuthEmail(
  input: SendAuthEmailInput,
  deps: SendAuthEmailDeps = {},
): Promise<AuthEmailOutcome> {
  const env = deps.env ?? process.env;
  const store = authEmailStore.getStore();

  // Hourly per-address limit for sends the route wrapper hasn't already
  // counted (the ones triggered by sign-up and sign-in).
  if (!store?.emailSendCounted) {
    const limited = rateLimit(emailKey("email-send", input.to), EMAIL_SEND_RATE_LIMIT);
    if (!limited.ok) {
      logger.warn("Account email not sent: hourly limit for this address reached", {
        kind: input.kind,
      });
      return record("rate_limited");
    }
  }

  const origin = emailLinkOrigin(env, input.betterAuthUrl);
  if (!origin) {
    const message =
      "Account email not sent: BETTER_AUTH_URL is missing or points at localhost, so the link in the email couldn't work. Set BETTER_AUTH_URL to the app's public address.";
    logger.error(message, { kind: input.kind });
    await reportToSentry(message);
    return record("failed");
  }

  const contactEmail = getLegalContactEmail(env);
  let email: RenderedEmail;
  if (input.kind === "verify") {
    email = buildVerifyEmail({ name: input.name, url: buildVerifyLink(origin, input.token ?? ""), contactEmail });
  } else if (input.kind === "reset") {
    email = buildResetEmail({ name: input.name, url: buildResetLink(origin, input.token ?? ""), contactEmail });
  } else {
    email = buildExistingAccountEmail({ name: input.name, url: `${origin}/sign-in`, contactEmail });
  }

  const send = deps.sendEmailFn ?? ((payload) => sendEmail(payload));
  const result = await send({ to: input.to, ...email });
  if (!result.ok) {
    const message = "Account email could not be sent";
    logger.error(message, { kind: input.kind, reason: result.unavailable });
    await reportToSentry(`${message} (${input.kind}, ${result.unavailable})`);
    return record("failed");
  }
  return record("sent");
}
