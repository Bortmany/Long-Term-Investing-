"use client";

// Choose a new password (go-public-ui.md §2.7). Same password rules as
// sign-up. On success every signed-in session for the account is ended
// (revokeSessionsOnPasswordReset in src/lib/auth.ts), and the card says so.

import { useState } from "react";
import Link from "next/link";
import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";

import { authClient } from "@/lib/auth-client";
import {
  SERVER_ERROR_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
  resetPasswordSchema,
} from "@/lib/auth-schema";
import { IconBadge, PasswordInput, TextLink } from "@/components/auth/auth-bits";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";

export function InvalidResetLinkCard() {
  return (
    <Card className="w-full text-center">
      <CardHeader className="items-center">
        <IconBadge>
          <CircleAlert />
        </IconBadge>
        <CardTitle className="mt-4">This link is invalid or has expired</CardTitle>
        <CardDescription>Reset links work for 1 hour and only once.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">Get a new link</Link>
        </Button>
        <p className="text-sm">
          <TextLink href="/sign-in">Back to sign in</TextLink>
        </p>
      </CardContent>
    </Card>
  );
}

function PasswordChangedCard() {
  return (
    <Card className="w-full text-center" role="status">
      <CardHeader className="items-center">
        <IconBadge tone="green">
          <CircleCheck />
        </IconBadge>
        <CardTitle className="mt-4">Password changed</CardTitle>
        <CardDescription>
          You&apos;ve been signed out on your other devices. Sign in with your new password.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild size="lg" className="w-full">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<"password" | "confirm" | null>(null);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<"form" | "changed" | "invalid">("form");

  if (state === "changed") return <PasswordChangedCard />;
  if (state === "invalid") return <InvalidResetLinkCard />;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);
    const parsed = resetPasswordSchema.safeParse({ password, confirm });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(issue?.message ?? "Invalid input.");
      setFieldError(issue?.path[0] === "confirm" ? "confirm" : "password");
      return;
    }
    setPending(true);
    const { error: resetError } = await authClient.resetPassword({
      newPassword: parsed.data.password,
      token,
    });
    setPending(false);
    if (!resetError) {
      setState("changed");
      return;
    }
    if (resetError.code === "INVALID_TOKEN") {
      setState("invalid");
      return;
    }
    if (resetError.status === 429) {
      setError(TOO_MANY_ATTEMPTS_MESSAGE);
      return;
    }
    if (resetError.code === "PASSWORD_TOO_SHORT") {
      setFieldError("password");
      setError("Your password needs to be at least 8 characters.");
      return;
    }
    setError(
      resetError.status && resetError.status < 500 && resetError.message
        ? resetError.message
        : SERVER_ERROR_MESSAGE,
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Choose a new password</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit} noValidate>
        <CardContent className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <PasswordInput
              id="new-password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              invalid={fieldError === "password"}
              disabled={pending}
              describedBy="new-password-help"
            />
            <p id="new-password-help" className="text-xs text-slate-500 dark:text-slate-400">
              At least 8 characters.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password">Confirm new password</Label>
            <PasswordInput
              id="confirm-password"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              invalid={fieldError === "confirm"}
              disabled={pending}
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Changing…
              </>
            ) : (
              "Change password"
            )}
          </Button>
        </CardContent>
      </form>
    </Card>
  );
}
