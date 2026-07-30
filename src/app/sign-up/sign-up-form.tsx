"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";

import { signUp } from "@/lib/auth-client";
import { errorFieldClass, signUpSchema } from "@/lib/auth-schema";
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

/** The red border + ring the failing box wears, same as the sign-in page. */

export function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<
    "name" | "email" | "password" | null
  >(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
    const { error: signUpError } = await signUp.email({
      name: parsed.data.name,
      email: parsed.data.email,
      password: parsed.data.password,
    });
    setPending(false);

    if (signUpError) {
      // Better Auth re-checks the email shape on the server. If that is what
      // came back, mark the email box so the user sees where the problem is.
      if (signUpError.code === "INVALID_EMAIL") {
        setFieldError("email");
        setError("Enter a real email address, like Ahmed@gmail.com.");
        return;
      }
      setError(signUpError.message ?? "Sign-up failed. Please try again.");
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
          <CardTitle>Create your account</CardTitle>
          <CardDescription>Set up InvestIQ AI.</CardDescription>
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
                aria-invalid={fieldError === "name" || undefined}
                className={fieldError === "name" ? errorFieldClass : undefined}
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
                aria-invalid={fieldError === "email" || undefined}
                className={fieldError === "email" ? errorFieldClass : undefined}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
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
                  Creating account…
                </>
              ) : (
                "Create account"
              )}
            </Button>
            <p className="text-center text-sm text-slate-500 dark:text-slate-400">
              Already have an account?{" "}
              <Link
                href="/sign-in"
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
      <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
        <Link href="/privacy" className="hover:underline">
          Privacy
        </Link>
        {" · "}
        <Link href="/terms" className="hover:underline">
          Terms
        </Link>
      </p>
    </main>
  );
}
