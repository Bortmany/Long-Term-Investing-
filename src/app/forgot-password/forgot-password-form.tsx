"use client";

// The forgot-password form. After sending, the answer is ALWAYS the same
// whether or not the address has an account (saying otherwise would reveal
// who is registered). If the send itself failed, the server has logged it;
// the "Nothing after a few minutes? Contact …" line is always shown.

import { useState } from "react";
import { LoaderCircle, Mail } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import {
  SERVER_ERROR_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
  emailOnlySchema,
  errorFieldClass,
  resetSendLimitedMessage,
} from "@/lib/auth-schema";
import { IconBadge, TextLink } from "@/components/auth/auth-bits";
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

export function ForgotPasswordForm({ contactEmail }: { contactEmail: string }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

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
    // The link inside the email is built on the server (always to our own
    // /reset-password page), so no redirectTo is sent from here.
    const { error: requestError } = await authClient.requestPasswordReset({
      email: parsed.data.email,
    });
    setPending(false);
    if (!requestError) {
      setDone(true);
      return;
    }
    if (requestError.status === 429) {
      setError(
        requestError.code === "EMAIL_SEND_LIMITED"
          ? resetSendLimitedMessage(contactEmail)
          : TOO_MANY_ATTEMPTS_MESSAGE,
      );
      return;
    }
    if (requestError.code === "INVALID_EMAIL" || requestError.code === "VALIDATION_ERROR") {
      setFieldError(true);
      setError("Enter a real email address, like Ahmed@gmail.com.");
      return;
    }
    setError(SERVER_ERROR_MESSAGE);
  }

  if (done) {
    return (
      <Card className="w-full text-center">
        <CardHeader className="items-center">
          <IconBadge>
            <Mail />
          </IconBadge>
          <CardTitle className="mt-4">Check your inbox</CardTitle>
          <CardDescription>
            If there&apos;s an account for that address, we&apos;ve sent a link. It works for 1
            hour.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-slate-500 dark:text-slate-400" role="status">
            Nothing after a few minutes? Contact{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {contactEmail}
            </a>
            .
          </p>
          <p className="text-sm">
            <TextLink href="/sign-in">Back to sign in</TextLink>
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Forgot your password?</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a link to choose a new one.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
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
              "Send reset link"
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
