// The plain frame around a public stock page: header, content column, footer.
// Server components only (no scripts, no cookies, no session reads) so the
// page can be prepared ahead and cached for everyone.
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  PUBLIC_COPY,
  PUBLIC_NOT_ADVICE_LINE,
  PUBLIC_POSITIONING_LINE,
} from "@/lib/public-stock-copy";

const footerLink =
  "inline-flex min-h-11 items-center px-2 text-slate-600 underline-offset-4 hover:underline focus-visible:underline dark:text-slate-400";

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="inline-flex min-h-11 items-center text-base font-semibold tracking-tight">
          InvestIQ AI
        </Link>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="lg" className="hidden lg:inline-flex">
            <Link href="/sign-up">{PUBLIC_COPY.trackCta}</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link href="/sign-in">{PUBLIC_COPY.signIn}</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="mt-auto border-t border-slate-200 dark:border-slate-800">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6 sm:px-6">
        <p className="text-sm text-slate-600 dark:text-slate-400">{PUBLIC_NOT_ADVICE_LINE}</p>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-tight">InvestIQ AI</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {PUBLIC_POSITIONING_LINE}
            </p>
          </div>
          <nav aria-label="Footer" className="-mx-2 flex items-center text-sm">
            <Link href="/terms" className={footerLink}>
              Terms
            </Link>
            <span aria-hidden="true" className="text-slate-400">
              ·
            </span>
            <Link href="/privacy" className={footerLink}>
              Privacy
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}

/** Header + footer around any public page (stock page, 404). */
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-12 pt-6 sm:px-6 lg:pt-10">
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
