// Landing page footer (go-public-ui.md §1.8): wordmark, the positioning
// sentence, and Terms · Privacy · Sign in · Contact, each with a 44px tap
// height. The contact address comes from getLegalContactEmail (passed in by
// the page, read on the server) — never hardcoded here.
import Link from "next/link";

import { POSITIONING_LINE } from "@/components/landing/landing-copy";

const linkClass =
  "inline-flex min-h-11 items-center px-2 text-slate-500 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-50";

export function LandingFooter({ contactEmail }: { contactEmail: string }) {
  return (
    <footer className="border-t border-slate-200 dark:border-slate-800">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-6 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
        <div>
          <p className="text-sm font-semibold tracking-tight">InvestIQ AI</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{POSITIONING_LINE}</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap items-center justify-center text-xs">
          <Link href="/terms" className={linkClass}>
            Terms
          </Link>
          <span aria-hidden="true" className="text-slate-400">
            ·
          </span>
          <Link href="/privacy" className={linkClass}>
            Privacy
          </Link>
          <span aria-hidden="true" className="text-slate-400">
            ·
          </span>
          <Link href="/sign-in" className={linkClass}>
            Sign in
          </Link>
          <span aria-hidden="true" className="text-slate-400">
            ·
          </span>
          <a href={`mailto:${contactEmail}`} className={linkClass}>
            Contact
          </a>
        </nav>
      </div>
    </footer>
  );
}
