"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";

import { signIn } from "@/lib/auth-client";
import { errorFieldClass, signInSchema } from "@/lib/auth-schema";
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

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<"email" | "password" | null>(
    null,
  );
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);

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
    setPending(false);

    if (signInError) {
      setError("Incorrect email or password.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <p className="mb-6 text-xl font-semibold">InvestIQ AI</p>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Access your portfolio dashboard.</CardDescription>
        </CardHeader>
        {/* noValidate: our own zod messages (plain English, shown on the
            field) do the talking instead of the browser's built-in tooltip. */}
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
                aria-invalid={fieldError === "email" || undefined}
                className={
                  fieldError === "email" ? errorFieldClass : undefined
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-invalid={fieldError === "password" || undefined}
                className={
                  fieldError === "password" ? errorFieldClass : undefined
                }
              />
            </div>
          </CardContent>
          <CardFooter className="mt-6 flex-col space-y-3">
            <Button type="submit" className="w-full" disabled={pending}>
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
              <Link
                href="/sign-up"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                Sign up
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
      <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
        <Link
          href="/privacy"
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          Privacy
        </Link>
        {" · "}
        <Link
          href="/terms"
          className="text-blue-600 hover:underline dark:text-blue-400"
        >
          Terms
        </Link>
      </p>
    </main>
  );
}
