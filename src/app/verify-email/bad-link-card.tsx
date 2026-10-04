"use client";

// Invalid, expired or already-used confirmation link (go-public-ui.md §2.4):
// an email box and "Send a new link", with the same send rules and honest
// outcomes as Check your inbox. After a successful send the card turns into
// the Check your inbox content.

import { useState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";

import {
  EMAIL_NOT_SET_UP_RESEND_MESSAGE,
  SERVER_ERROR_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
  emailOnlySchema,
  emailSendFailedMessage,
  emailSendLimitedMessage,
  errorFieldClass,
} from "@/lib/auth-schema";
import { IconBadge, TextLink } from "@/components/auth/auth-bits";
import { CheckInboxCard, requestConfirmationEmail } from "@/components/auth/check-inbox-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BadLinkCard({ title, contactEmail }: { title: string; contactEmail: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState(false);
  const [pending, setPending] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo) {
    return <CheckInboxCard email={sentTo} sent="sent" contactEmail={contactEmail} />;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(false);
    const parsed = emailOnlySchema.safeParse({ email });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter your email address.");
      setFieldError(true);
      return;
    }
    setPending(true);
    const { result } = await requestConfirmationEmail(parsed.data.email);
    setPending(false);
    if (result === "sent") setSentTo(parsed.data.email);
    else if (result === "not_set_up") setError(EMAIL_NOT_SET_UP_RESEND_MESSAGE);
    else if (result === "failed") setError(emailSendFailedMessage(contactEmail));
    else if (result === "limited") setError(emailSendLimitedMessage(contactEmail));
    else if (result === "slow_down") setError(TOO_MANY_ATTEMPTS_MESSAGE);
    else setError(SERVER_ERROR_MESSAGE);
  }

  return (
    <Card className="w-full">
      <CardHeader className="items-center text-center">
        <IconBadge>
          <CircleAlert />
        </IconBadge>
        <CardTitle className="mt-4">{title}</CardTitle>
        <CardDescription>
          Confirmation links work for 24 hours and only once. Enter your email and we&apos;ll
          send a fresh one.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="space-y-4">
          <div aria-live="polite">
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="Ahmed@gmail.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={pending}
              aria-invalid={fieldError || undefined}
              className={`h-11 ${fieldError ? errorFieldClass : ""}`}
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Sending…
              </>
            ) : (
              "Send a new link"
            )}
          </Button>
          <p className="text-center text-sm">
            <TextLink href="/sign-in">Back to sign in</TextLink>
          </p>
        </CardContent>
      </form>
    </Card>
  );
}
