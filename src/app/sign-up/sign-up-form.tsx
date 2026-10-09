"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";

import { signUp } from "@/lib/auth-client";
import {
  EMAIL_NOT_SET_UP_NOTE,
  SERVER_ERROR_NOTHING_SAVED,
  TOO_MANY_ATTEMPTS_MESSAGE,
  errorFieldClass,
  formatCountdown,
  signUpSchema,
  type EmailDelivery,
} from "@/lib/auth-schema";
import { PasswordInput, tapLinkClass, useCountdown } from "@/components/auth/auth-bits";
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

/** After a 429 the button stays disabled this long, with a countdown. */
const RATE_LIMIT_PAUSE_SECONDS = 60;

export function SignUpForm({ emailConfigured }: { emailConfigured: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<
    "name" | "email" | "password" | null
  >(null);
  const [pending, setPending] = useState(false);
  const cooldown = useCountdown();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || cooldown.remaining > 0) return;
    setError(null);
    setFieldError(null);

    const parsed = signUpSchema.safeParse({ name, email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Invalid input.");
      // Point at the field that failed so the user knows which box to fix.
      const failedField = parsed.error.issues[0]?.path[0];
      if (
        failedField === "name" ||
        failedField === "email" ||
        failedField === "password"
      ) {
        setFieldError(failedField);
      }
      return;
    }

    setPending(true);
    const { data, error: signUpError } = await signUp.email({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (signUpError) {
      setPending(false);
      if (signUpError.status === 429) {
        setError(TOO_MANY_ATTEMPTS_MESSAGE);
        cooldown.start(RATE_LIMIT_PAUSE_SECONDS);
        return;
      }
      // Better Auth re-checks the email shape on the server. If that is what
      // came back, mark the email box so the user sees where the problem is.
      if (signUpError.code === "INVALID_EMAIL") {
        setFieldError("email");
        setError("Enter a real email address, like Ahmed@gmail.com.");
        return;
      }
      if (!signUpError.status || signUpError.status >= 500) {
        setError(SERVER_ERROR_NOTHING_SAVED);
        return;
      }
      setError(signUpError.message ?? SERVER_ERROR_NOTHING_SAVED);
      return;
    }

    // Signed in straight away (only when email isn't set up, local
    // development): go to the dashboard as before.
    if (data?.token) {
      router.push("/dashboard");
      router.refresh();
      return;
    }

    // Otherwise nobody is signed in yet: go and check the inbox. The page is
    // told honestly whether the email actually went out.
    const delivery =
      ((data as { emailDelivery?: EmailDelivery } | null)?.emailDelivery) ?? "failed";
    const params = new URLSearchParams({ email: parsed.data.email, sent: delivery });
    router.push(`/check-email?${params.toString()}`);
  }

  const locked = pending || cooldown.remaining > 0;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Create your account</CardTitle>
        <CardDescription>It&apos;s free. No card needed.</CardDescription>
      </CardHeader>
      {/* noValidate: our own zod messages (plain English, shown on the
          field) do the talking instead of the browser's built-in tooltip. */}
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="space-y-4">
          {!emailConfigured ? (
            <Alert variant="warning">
              <AlertDescription className="text-amber-700 dark:text-amber-400">
                {EMAIL_NOT_SET_UP_NOTE}
              </AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          {/* Better Auth's email sign-up requires a name, so the field stays. */}
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Ahmed Al Balushi"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={pending}
              aria-invalid={fieldError === "name" || undefined}
              className={`h-11 ${fieldError === "name" ? errorFieldClass : ""}`}
            />
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
              autoComplete="new-password"
              invalid={fieldError === "password"}
              disabled={pending}
              describedBy="password-help"
            />
            <p id="password-help" className="text-xs text-slate-500 dark:text-slate-400">
              At least 8 characters.
            </p>
          </div>
        </CardContent>
        <CardFooter className="mt-6 flex-col space-y-3">
          <Button type="submit" size="lg" className="w-full" disabled={locked}>
            {pending ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Creating account…
              </>
            ) : cooldown.remaining > 0 ? (
              `Try again in ${formatCountdown(cooldown.remaining)}`
            ) : (
              "Create account"
            )}
          </Button>
          <p className="text-center text-xs text-slate-500 dark:text-slate-400">
            By creating an account you agree to the{" "}
            <Link href="/terms" className={tapLinkClass}>
              Terms
            </Link>{" "}
            and the{" "}
            <Link href="/privacy" className={tapLinkClass}>
              Privacy Policy
            </Link>
            .
          </p>
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            Already have an account?{" "}
            <Link href="/sign-in" className={tapLinkClass}>
              Sign in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
