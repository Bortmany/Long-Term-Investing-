// Verify-email result (go-public-ui.md §2.4). Every emailed confirmation
// link goes through Better Auth (/api/auth/verify-email), which then sends
// the browser here:
//   /verify-email?confirmed=1                     → confirmed (and signed in)
//   /verify-email?confirmed=1&error=TOKEN_EXPIRED → the link is too old
//   /verify-email?confirmed=1&error=INVALID_TOKEN → the link isn't valid
//   (…&error=USER_NOT_FOUND / INVALID_USER        → treated as not valid)
// Never a blank page or raw JSON: every case gets a plain card.

import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CircleCheck } from "lucide-react";

import { auth } from "@/lib/auth";
import { getLegalContactEmail } from "@/lib/legal-contact";
import { AuthShell } from "@/components/auth/auth-shell";
import { IconBadge } from "@/components/auth/auth-bits";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BadLinkCard } from "./bad-link-card";

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** The card title for a bad link; Better Auth tells expired apart from invalid. */
function badLinkTitle(error: string | undefined): string {
  if (error === "TOKEN_EXPIRED") return "This link has expired";
  if (error === "INVALID_TOKEN") return "This link isn't valid";
  return "This link is invalid or has expired";
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = first(params.error);
  const confirmed = first(params.confirmed) === "1";

  // A bad, used or expired link — or someone who typed this address by hand.
  if (error || !confirmed) {
    return (
      <AuthShell>
        <BadLinkCard title={badLinkTitle(error)} contactEmail={getLegalContactEmail()} />
      </AuthShell>
    );
  }

  // Confirmed. Better Auth signed this browser in, so go to the dashboard
  // with the one-line "Email confirmed" notice.
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/dashboard?verified=1");
  }

  // Confirmed, but this browser isn't signed in (for example the address was
  // already confirmed and the link was opened somewhere else).
  return (
    <AuthShell>
      <Card className="w-full text-center">
        <CardHeader className="items-center">
          <IconBadge tone="green">
            <CircleCheck />
          </IconBadge>
          <CardTitle className="mt-4">Email confirmed</CardTitle>
          <CardDescription>You&apos;re all set. Sign in to get started.</CardDescription>
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
