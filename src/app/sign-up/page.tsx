// Server wrapper for the sign-up page. Sign-ups are OPEN by default.
// getSignUpStatus() (src/lib/auth.ts) closes them when SIGNUPS_PAUSED="true"
// ("paused") or when production can't send confirmation emails
// ("email_unavailable"). When closed, the form is replaced by a calm card —
// and the server refuses sign-up attempts too (the auth route wrapper checks
// the same function), so the gate is not just visual.

import Link from "next/link";
import { connection } from "next/server";

import { getSignUpStatus } from "@/lib/auth";
import {
  SIGNUPS_PAUSED_MESSAGE,
  SIGNUPS_PAUSED_TITLE,
  SIGNUPS_UNAVAILABLE_MESSAGE,
  SIGNUPS_UNAVAILABLE_TITLE,
} from "@/lib/auth-schema";
import { isEmailConfigured } from "@/lib/email/send";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SignUpForm } from "./sign-up-form";

export default async function SignUpPage() {
  // Evaluate per request, not at build time — otherwise the prerendered page
  // could keep showing the form after sign-ups were paused.
  await connection();

  const status = getSignUpStatus();
  if (status.open) {
    return (
      <AuthShell>
        <SignUpForm emailConfigured={isEmailConfigured()} />
      </AuthShell>
    );
  }

  const paused = status.reason === "paused";
  return (
    <AuthShell>
      <Card className="w-full">
        <CardHeader>
          <CardTitle>{paused ? SIGNUPS_PAUSED_TITLE : SIGNUPS_UNAVAILABLE_TITLE}</CardTitle>
          <CardDescription>
            {paused ? SIGNUPS_PAUSED_MESSAGE : SIGNUPS_UNAVAILABLE_MESSAGE}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild size="lg" className="w-full">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
