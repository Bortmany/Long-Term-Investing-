// Forgot password (go-public-ui.md §2.6). With email set up: the form.
// Without email: no form — a plain notice, because a reset link could never
// arrive and we never pretend it did.

import { connection } from "next/server";

import { isEmailConfigured } from "@/lib/email/send";
import { getLegalContactEmail } from "@/lib/legal-contact";
import { AuthShell } from "@/components/auth/auth-shell";
import { TextLink } from "@/components/auth/auth-bits";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  // Decide per request (email settings can change between deploys).
  await connection();
  const contactEmail = getLegalContactEmail();

  if (!isEmailConfigured()) {
    return (
      <AuthShell>
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Reset by email isn&apos;t available</CardTitle>
            <CardDescription>
              Password reset by email isn&apos;t available on this server because email sending
              isn&apos;t set up. Please contact{" "}
              <a
                href={`mailto:${contactEmail}`}
                className="text-blue-600 hover:underline dark:text-blue-400"
              >
                {contactEmail}
              </a>
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm">
              <TextLink href="/sign-in">Back to sign in</TextLink>
            </p>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <ForgotPasswordForm contactEmail={contactEmail} />
    </AuthShell>
  );
}
