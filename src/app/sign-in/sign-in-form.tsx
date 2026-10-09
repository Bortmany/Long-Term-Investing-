"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";

import { signIn } from "@/lib/auth-client";
import {
  INCORRECT_CREDENTIALS_MESSAGE,
  UNCONFIRMED_FAILED_MESSAGE,
  UNCONFIRMED_LIMITED_MESSAGE,
  UNCONFIRMED_SENT_MESSAGE,
  errorFieldClass,
  signInSchema,
  type EmailDelivery,
} from "@/lib/auth-schema";
import { PasswordInput, tapLinkClass } from "@/components/auth/auth-bits";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** The sign-in screen's message for "right password, email not confirmed". */
export function unconfirmedMessage(delivery: EmailDelivery | undefined): string {
  if (delivery === "sent") return UNCONFIRMED_SENT_MESSAGE;
  if (delivery === "rate_limited") return UNCONFIRMED_LIMITED_MESSAGE;
  return UNCONFIRMED_FAILED_MESSAGE;
}

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<"email" | "password" | null>(
    null,
  );
  // Set when the password was right but the email isn't confirmed yet.
  const [resendHref, setResendHref] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    setResendHref(null);

    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input.");
      // Point at the field that failed so the user knows which box to fix.
      const failedField = parsed.error.issues[0]?.path[0];
      if (failedField === "email" || failedField === "password") {
        setFieldError(failedField);
      }
      return;
    }

    setPending(true);
    const { error: signInError } = await signIn.email({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (signInError) {
      setPending(false);
      // Better Auth only says "not confirmed" AFTER the password was checked,
      // so a wrong password on an unconfirmed account still lands in the
      // ordinary "Incorrect email or password." branch below (pinned by
      // tests/unit/auth-sign-in-order.test.ts).
      if (signInError.status === 403 && signInError.code === "EMAIL_NOT_VERIFIED") {
        const delivery = (signInError as { emailDelivery?: EmailDelivery }).emailDelivery;
        setError(unconfirmedMessage(delivery));
        const params = new URLSearchParams({
          email: parsed.data.email,
          sent: delivery ?? "failed",
        });
        setResendHref(`/check-email?${params.toString()}`);
        return;
      }
      if (signInError.status === 429) {
        setError(signInError.message ?? "Too many attempts. Please wait a few minutes and try again.");
        return;
      }
      setError(INCORRECT_CREDENTIALS_MESSAGE);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Access your portfolio dashboard.</CardDescription>
      </CardHeader>
      {/* noValidate: our own zod messages (plain English, shown on the
          field) do the talking instead of the browser's built-in tooltip. */}
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="space-y-4">
          {error ? (
            <div className="space-y-1">
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
              {resendHref ? (
                <Link href={resendHref} className={`${tapLinkClass} text-sm`}>
                  Resend confirmation email
                </Link>
              ) : null}
            </div>
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
              aria-invalid={fieldError === "email" || undefined}
              className={`h-11 ${fieldError === "email" ? errorFieldClass : ""}`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              invalid={fieldError === "password"}
              disabled={pending}
            />
            <div className="flex justify-end">
              <Link href="/forgot-password" className={`${tapLinkClass} text-sm`}>
                Forgot password?
              </Link>
            </div>
          </div>
        </CardContent>
        <CardFooter className="mt-2 flex-col space-y-3">
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </Button>
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Don&apos;t have an account?{" "}
            <Link href="/sign-up" className={tapLinkClass}>
              Sign up
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
