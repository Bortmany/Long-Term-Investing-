// Server wrapper for the sign-up page. Sign-ups are closed by default (only
// ALLOW_SIGNUPS="true" opens them): the form is replaced by a calm
// registration-closed message — and the server rejects sign-up attempts too
// (see src/lib/auth.ts), so the gate is not just visual.

import Link from "next/link";
import { connection } from "next/server";

import { signUpsAllowed } from "@/lib/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignUpForm } from "./sign-up-form";

export default async function SignUpPage() {
  // Evaluate ALLOW_SIGNUPS per request, not at build time — otherwise the
  // prerendered page could keep showing the form after sign-ups were closed.
  await connection();

  if (signUpsAllowed()) {
    return <SignUpForm />;
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
      <p className="mb-6 text-xl font-semibold">InvestIQ AI</p>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Registration is closed</CardTitle>
          <CardDescription>
            This app isn&apos;t accepting new accounts right now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            If you already have an account, you can{" "}
            <Link
              href="/sign-in"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              sign in here
            </Link>
            .
          </p>
        </CardContent>
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
