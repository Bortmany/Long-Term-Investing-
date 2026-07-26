import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Calculator,
  Download,
  Globe,
  Landmark,
  Lock,
  ReceiptText,
  Trash2,
  Users,
} from "lucide-react";

import { auth } from "@/lib/auth";
import { AiDisclaimer } from "@/components/ai-disclaimer";
import { Reveal } from "@/components/landing/reveal";
import { SourceBadge } from "@/components/source-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "InvestIQ AI — calm, honest long-term investing",
  description:
    "A private long-term investing companion for portfolios across the US, Muscat, Tadawul and Dubai markets. Every number carries its source.",
};

// The interactive demo pulls in recharts, so it's lazy-loaded and never
// blocks the landing page's first paint. The fallback is a shaped skeleton.
const PortfolioXray = dynamic(() => import("@/components/landing/portfolio-xray"), {
  loading: () => <XraySkeleton />,
});

function XraySkeleton() {
  return (
    <div>
      <div className="flex flex-wrap justify-center gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-28 rounded-md" />
        ))}
      </div>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-8 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

const MARKETS = [
  { code: "US", country: "United States", exchange: "NYSE & NASDAQ" },
  { code: "MSX", country: "Oman", exchange: "Muscat Stock Exchange" },
  { code: "TASI", country: "Saudi Arabia", exchange: "Tadawul" },
  { code: "DFM", country: "UAE", exchange: "Dubai Financial Market" },
];

const COMMITTEE_SEATS = [
  "Value",
  "Growth",
  "Dividend & income",
  "Quality",
  "Macro",
  "Contrarian",
];

const HOW_IT_WORKS = [
  {
    icon: ReceiptText,
    title: "Record what you actually did",
    body: "Buys, sells, deposits, dividends received — you enter transactions and nothing else. No balances to maintain, no numbers to remember.",
  },
  {
    icon: Calculator,
    title: "Everything else is derived",
    body: "Your holdings, cash balance and dividend income are computed from those transactions. They can't drift out of sync, because they're never typed in.",
  },
  {
    icon: Globe,
    title: "Valued honestly, in OMR",
    body: "Positions across four markets roll up into one portfolio value. When a price or FX rate is missing, the app says so — it never pads the total with a guess.",
  },
];

// Signed-in users still land on the dashboard; signed-out visitors see the
// landing page (src/proxy.ts lists "/" as public).
export default async function LandingPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <p className="text-lg font-semibold tracking-tight">InvestIQ AI</p>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto max-w-5xl px-6 pb-20 pt-20 text-center sm:pb-28 sm:pt-28">
          <Reveal>
            <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              Long-term investing, minus the noise.
            </h1>
          </Reveal>
          <Reveal delay={100}>
            <p className="mx-auto mt-6 max-w-2xl text-pretty text-base text-slate-500 dark:text-slate-400 sm:text-lg">
              A private companion for portfolios that span New York, Muscat, Tadawul and Dubai.
              It derives your cash and dividends from what you actually did — and never shows
              you a number without saying where it came from.
            </p>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-10 flex flex-col items-center gap-3">
              <Button asChild size="lg">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                New accounts are invitation-only for now.
              </p>
            </div>
          </Reveal>
        </section>

        {/* Interactive demo */}
        <section className="border-t border-slate-200 dark:border-slate-800">
          <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Try the portfolio X-ray
                </h2>
                <p className="mt-3 text-slate-500 dark:text-slate-400">
                  This is sample data running the app&apos;s real ideas: pick a few holdings and
                  watch value, cash and dividend income recompute — with every figure labeled.
                </p>
              </div>
            </Reveal>
            <Reveal delay={100} className="mt-10">
              <PortfolioXray />
            </Reveal>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t border-slate-200 dark:border-slate-800">
          <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
            <Reveal>
              <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
                Transactions in, truth out
              </h2>
            </Reveal>
            <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
              {HOW_IT_WORKS.map((step, index) => (
                <Reveal key={step.title} delay={index * 100}>
                  <div>
                    <div className="flex size-11 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800">
                      <step.icon
                        className="size-5 text-slate-600 dark:text-slate-400"
                        aria-hidden="true"
                      />
                    </div>
                    <h3 className="mt-4 font-semibold">{step.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                      {step.body}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
            <Reveal delay={200}>
              <div className="mt-12 rounded-lg border border-slate-200 p-6 dark:border-slate-800">
                <p className="text-sm font-medium">
                  The house rule: no number appears without its source.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <SourceBadge variant="live" />
                  <SourceBadge variant="manual" date="Jul 10, 2026" />
                  <SourceBadge variant="derived" />
                  <SourceBadge variant="sample" />
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
                  Live from the market, entered by hand with its date, computed from your own
                  transactions, or sample data — and when a source is unavailable, the app says
                  &ldquo;unavailable&rdquo; instead of inventing a figure.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* AI committee teaser */}
        <section className="border-t border-slate-200 dark:border-slate-800">
          <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2">
              <Reveal>
                <div>
                  <div className="flex size-11 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800">
                    <Users
                      className="size-5 text-slate-600 dark:text-slate-400"
                      aria-hidden="true"
                    />
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                    Six AI analysts argue it out
                  </h2>
                  <p className="mt-3 text-slate-500 dark:text-slate-400">
                    Before a buy or sell, an AI committee reads the same data and votes
                    independently — you see every vote and every disagreement, not a smoothed-over
                    summary. Each analysis is saved with its date, model and data freshness, and
                    is never quietly regenerated behind your back.
                  </p>
                  <div className="mt-5">
                    <AiDisclaimer />
                  </div>
                </div>
              </Reveal>
              <Reveal delay={100}>
                <div className="grid grid-cols-2 gap-3">
                  {COMMITTEE_SEATS.map((seat) => (
                    <div
                      key={seat}
                      className="rounded-lg border border-slate-200 px-4 py-3 text-sm font-medium dark:border-slate-800"
                    >
                      {seat}
                      <p className="mt-0.5 text-xs font-normal text-slate-500 dark:text-slate-400">
                        analyst
                      </p>
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Multi-market */}
        <section className="border-t border-slate-200 dark:border-slate-800">
          <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
            <Reveal>
              <div className="mx-auto max-w-2xl text-center">
                <div className="mx-auto flex size-11 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800">
                  <Landmark
                    className="size-5 text-slate-600 dark:text-slate-400"
                    aria-hidden="true"
                  />
                </div>
                <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Four markets, one honest portfolio
                </h2>
                <p className="mt-3 text-slate-500 dark:text-slate-400">
                  Built for investors whose money doesn&apos;t live on one exchange.
                </p>
              </div>
            </Reveal>
            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {MARKETS.map((market, index) => (
                <Reveal key={market.country} delay={index * 75}>
                  <Card className="h-full">
                    <CardContent className="p-5">
                      <p className="inline-flex rounded-md border border-slate-200 px-2 py-1 font-mono text-xs font-medium text-slate-600 dark:border-slate-800 dark:text-slate-400">
                        {market.code}
                      </p>
                      <p className="mt-3 font-semibold">{market.country}</p>
                      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        {market.exchange}
                      </p>
                    </CardContent>
                  </Card>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Privacy */}
        <section className="border-t border-slate-200 dark:border-slate-800">
          <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
            <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2">
              <Reveal>
                <div>
                  <div className="flex size-11 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800">
                    <Lock
                      className="size-5 text-slate-600 dark:text-slate-400"
                      aria-hidden="true"
                    />
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                    Your money is your business
                  </h2>
                  <p className="mt-3 text-slate-500 dark:text-slate-400">
                    No ads, no tracking pixels, no selling data. The privacy page lists exactly
                    what is stored and why — written against the actual database schema, and kept
                    in sync with it.
                  </p>
                  <p className="mt-4">
                    <Link
                      href="/privacy"
                      className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Read the privacy page
                    </Link>
                  </p>
                </div>
              </Reveal>
              <Reveal delay={100}>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                    <Download
                      className="mt-0.5 size-5 shrink-0 text-slate-600 dark:text-slate-400"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium">Take everything with you</p>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        Download your entire account — portfolios, transactions, notes — as one
                        JSON file, any time.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
                    <Trash2
                      className="mt-0.5 size-5 shrink-0 text-slate-600 dark:text-slate-400"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium">Leave without a trace</p>
                      <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        Delete your account and every record goes with it — actually deleted, not
                        archived.
                      </p>
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-slate-200 dark:border-slate-800">
          <div className="mx-auto max-w-5xl px-6 py-20 text-center sm:py-24">
            <Reveal>
              <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
                Calm compounding starts with honest numbers.
              </h2>
              <div className="mt-8 flex flex-col items-center gap-3">
                <Button asChild size="lg">
                  <Link href="/sign-in">Sign in</Link>
                </Button>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Don&apos;t have an account? Access is by invitation while InvestIQ AI is
                  private — check back for open registration.
                </p>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-6 py-8 sm:flex-row">
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold tracking-tight">InvestIQ AI</p>
            <Badge variant="secondary" className="font-normal">
              Private beta
            </Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            {" · "}
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            {" · "}
            <Link href="/sign-in" className="hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
