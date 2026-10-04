// AuthShell (go-public-ui.md §2.1): the one wrapper every account-access
// screen uses — sign-in, sign-up, check your inbox, verify-email result,
// forgot password and reset password — so they all match.
//
// Phone and tablet: the grey page, the "InvestIQ AI" wordmark (links to /)
// 24px above a card up to 384px wide, Privacy and Terms under it.
// Laptop (1024px and up): two halves. Left: the wordmark plus a short
// reassurance list while someone decides to trust us with an email address.
// Right: the card (up to 448px) with Privacy and Terms under it.
//
// Server component (no state). The card itself is passed in as children.

import Link from "next/link";
import { BadgeCheck, Download, ShieldCheck } from "lucide-react";

const REASSURANCE = [
  { icon: BadgeCheck, text: "Every number shows where it came from" },
  { icon: ShieldCheck, text: "Portfolio tracking and research software, not personalised advice" },
  { icon: Download, text: "Download or delete your data any time" },
] as const;

const smallLinkClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center px-1 text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm dark:text-blue-400";

function Wordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={`inline-flex min-h-11 items-center rounded-sm text-xl font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className ?? ""}`}
    >
      InvestIQ AI
    </Link>
  );
}

function LegalLinks() {
  return (
    <p className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400">
      <Link href="/privacy" className={smallLinkClass}>
        Privacy
      </Link>
      <span aria-hidden="true"> · </span>
      <Link href="/terms" className={smallLinkClass}>
        Terms
      </Link>
    </p>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Left half — laptops only. */}
      <aside className="hidden w-1/2 flex-col border-r border-slate-200 bg-white p-12 lg:flex dark:border-slate-800 dark:bg-slate-900">
        <Wordmark />
        <div className="flex flex-1 flex-col justify-center">
          <p className="text-base font-semibold text-slate-900 dark:text-slate-50">
            Long-term investing, minus the noise.
          </p>
          <ul className="mt-6 space-y-4">
            {REASSURANCE.map(({ icon: Icon, text }) => (
              <li
                key={text}
                className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300"
              >
                <Icon className="size-5 shrink-0 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* The card side — full page on phones and tablets. */}
      <main className="flex w-full flex-col items-center justify-center p-4 lg:w-1/2">
        <Wordmark className="mb-6 lg:hidden" />
        <div className="w-full max-w-sm lg:max-w-md">{children}</div>
        <LegalLinks />
      </main>
    </div>
  );
}
