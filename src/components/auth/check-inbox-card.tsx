"use client";

// "Check your inbox" (go-public-ui.md §2.3), pattern from the Juicebox
// verify-email flow on Mobbin: names the address, the spam hint, a Resend
// button with a 60-second timer, and a "Wrong address?" link.
//
// Honest by construction: the lead sentence and every alert follow what the
// server actually reported (sent / failed / too many). It never says "sent"
// when the email didn't go out.

import { useState } from "react";
import { LoaderCircle, Mail } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import {
  SERVER_ERROR_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
  emailSendFailedMessage,
  emailSendLimitedMessage,
  formatCountdown,
  type EmailDelivery,
} from "@/lib/auth-schema";
import { IconBadge, TextLink, useCountdown } from "@/components/auth/auth-bits";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export const RESEND_WAIT_SECONDS = 60;

type Outcome =
  | { kind: "none" }
  | { kind: "resent" }
  | { kind: "failed" }
  | { kind: "limited" }
  | { kind: "slow_down" }
  | { kind: "error" };

export type ResendResult = "sent" | "failed" | "limited" | "slow_down" | "error";

/**
 * Ask the server for a fresh confirmation link and say honestly what
 * happened. Shared with the bad-link page.
 */
export async function requestConfirmationEmail(
  email: string,
): Promise<{ result: ResendResult; retryAfterSeconds?: number }> {
  // The link inside the email is built on the server (always to our own
  // /verify-email page), so no callbackURL is sent from here.
  const { error } = await authClient.sendVerificationEmail({ email });
  if (!error) return { result: "sent" };
  if (error.status === 429) {
    if (error.code === "EMAIL_SEND_LIMITED") return { result: "limited" };
    const retry = (error as { retryAfterSeconds?: number }).retryAfterSeconds;
    return { result: "slow_down", retryAfterSeconds: retry };
  }
  if (error.code === "EMAIL_SEND_FAILED") return { result: "failed" };
  return { result: "error" };
}

function initialOutcome(sent: EmailDelivery): Outcome {
  if (sent === "failed") return { kind: "failed" };
  if (sent === "rate_limited") return { kind: "limited" };
  return { kind: "none" };
}

export function CheckInboxCard({
  email,
  sent,
  contactEmail,
}: {
  email: string;
  /** What happened to the email that brought the person here. */
  sent: EmailDelivery;
  contactEmail: string;
}) {
  const [outcome, setOutcome] = useState<Outcome>(() => initialOutcome(sent));
  const [pending, setPending] = useState(false);
  const cooldown = useCountdown(RESEND_WAIT_SECONDS);

  const limited = outcome.kind === "limited";
  const waiting = cooldown.remaining > 0;
  const disabled = pending || waiting || limited;

  // The lead sentence must match what really happened to the LAST email.
  const lastSendFailed = outcome.kind === "failed" || (outcome.kind === "none" && sent === "failed");
  const lead = lastSendFailed
    ? "We couldn't send the confirmation link to"
    : limited
      ? "We've already sent several confirmation links to"
      : "We sent a confirmation link to";

  async function handleResend() {
    if (disabled) return;
    setPending(true);
    const { result, retryAfterSeconds } = await requestConfirmationEmail(email);
    setPending(false);
    if (result === "sent") {
      setOutcome({ kind: "resent" });
      cooldown.start(RESEND_WAIT_SECONDS);
    } else if (result === "failed") {
      setOutcome({ kind: "failed" });
      cooldown.start(RESEND_WAIT_SECONDS);
    } else if (result === "limited") {
      setOutcome({ kind: "limited" });
    } else if (result === "slow_down") {
      setOutcome({ kind: "slow_down" });
      cooldown.start(retryAfterSeconds ?? RESEND_WAIT_SECONDS);
    } else {
      setOutcome({ kind: "error" });
    }
  }

  let alert: React.ReactNode = null;
  if (outcome.kind === "resent") {
    alert = (
      <Alert variant="success">
        <AlertDescription className="text-green-600 dark:text-green-400">
          Sent again to {email}. Check your inbox.
        </AlertDescription>
      </Alert>
    );
  } else if (outcome.kind !== "none" || sent !== "sent") {
    const message =
      outcome.kind === "failed"
        ? emailSendFailedMessage(contactEmail)
        : outcome.kind === "limited"
          ? emailSendLimitedMessage(contactEmail)
          : outcome.kind === "slow_down"
            ? TOO_MANY_ATTEMPTS_MESSAGE
            : SERVER_ERROR_MESSAGE;
    alert = (
      <Alert variant="destructive">
        <AlertDescription>{message}</AlertDescription>
      </Alert>
    );
  }

  const label = pending ? (
    <>
      <LoaderCircle className="animate-spin" aria-hidden="true" />
      Sending…
    </>
  ) : limited ? (
    "Please wait"
  ) : waiting ? (
    `Resend in ${formatCountdown(cooldown.remaining)}`
  ) : (
    "Resend email"
  );

  const button = (
    <Button
      type="button"
      size="lg"
      className="w-full"
      onClick={handleResend}
      disabled={disabled}
      aria-disabled={disabled}
    >
      {label}
    </Button>
  );

  return (
    <Card className="w-full text-center">
      <CardHeader className="items-center">
        <IconBadge>
          <Mail />
        </IconBadge>
        <CardTitle className="mt-4">Check your inbox</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <p>
            {lead}
            <span className="mt-1 block break-all font-medium text-slate-900 dark:text-slate-50">
              {email}
            </span>
          </p>
          <p>The link works for 24 hours. If you can&apos;t see it, look in your spam folder.</p>
        </div>
        <div aria-live="polite" className="text-left">
          {alert}
        </div>
        {waiting && !pending && !limited ? (
          <Tooltip className="flex w-full">
            <TooltipTrigger className="w-full">{button}</TooltipTrigger>
            <TooltipContent>You can ask for another email once the timer ends.</TooltipContent>
          </Tooltip>
        ) : (
          button
        )}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          <TextLink href="/sign-up">Wrong address? Go back</TextLink>
        </p>
      </CardContent>
    </Card>
  );
}
