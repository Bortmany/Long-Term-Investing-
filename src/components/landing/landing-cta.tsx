// The landing page's call-to-action buttons (hero and final section).
// Sign-ups open: "Create free account" (filled) + "Sign in" (outline).
// Paused, email unavailable, or status unreadable: "Sign in" only, plus one
// honest line — never a "Create free account" that would lead nowhere.
import Link from "next/link";

import type { SignUpStatus } from "@/lib/auth";
import {
  CREATE_FREE_ACCOUNT,
  FREE_TO_START_LINE,
  SIGNUPS_PAUSED_LINE,
} from "@/components/landing/landing-copy";
import { Button } from "@/components/ui/button";

export function LandingCta({ signUpStatus }: { signUpStatus: SignUpStatus }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        {signUpStatus.open ? (
          <>
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/sign-up">{CREATE_FREE_ACCOUNT}</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </>
        ) : (
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/sign-in">Sign in</Link>
          </Button>
        )}
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {signUpStatus.open ? FREE_TO_START_LINE : SIGNUPS_PAUSED_LINE}
      </p>
    </div>
  );
}
