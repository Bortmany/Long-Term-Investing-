// Check your inbox (go-public-ui.md §2.3). Reached after sign-up (or from the
// sign-in screen's "Resend confirmation email" link) with ?email=…&sent=…,
// where `sent` is what the server honestly reported about the email.
// Opened with no usable address (someone typed the URL): a short card with
// "Create account" and "Sign in" instead.

import Link from "next/link";
import { Mail } from "lucide-react";

import { emailSchema, type EmailDelivery } from "@/lib/auth-schema";
import { getLegalContactEmail } from "@/lib/legal-contact";
import { AuthShell } from "@/components/auth/auth-shell";
import { IconBadge } from "@/components/auth/auth-bits";
import { CheckInboxCard } from "@/components/auth/check-inbox-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DELIVERY_VALUES: readonly EmailDelivery[] = ["sent", "failed", "rate_limited"];

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsedEmail = emailSchema.safeParse(first(params.email) ?? "");
  const sentParam = first(params.sent) as EmailDelivery | undefined;
  const sent: EmailDelivery =
    sentParam && DELIVERY_VALUES.includes(sentParam) ? sentParam : "sent";

  if (!parsedEmail.success) {
    return (
      <AuthShell>
        <Card className="w-full text-center">
          <CardHeader className="items-center">
            <IconBadge>
              <Mail />
            </IconBadge>
            <CardTitle className="mt-4">Check your inbox</CardTitle>
            <CardDescription>
              Sign up or sign in and we&apos;ll send you a confirmation link.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild size="lg" className="w-full">
              <Link href="/sign-up">Create account</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <CheckInboxCard
        email={parsedEmail.data}
        sent={sent}
        contactEmail={getLegalContactEmail()}
      />
    </AuthShell>
  );
}
