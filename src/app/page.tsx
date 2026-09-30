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

import { auth, getSignUpStatus } from "@/lib/auth";
import { isBillingEnabled } from "@/lib/billing/config";
import { getLegalContactEmail } from "@/lib/legal-contact";
import { AiDisclaimer } from "@/components/ai-disclaimer";
import { LandingCta } from "@/components/landing/landing-cta";
import {
  POSITIONING_LINE,
  readBillingEnabledSafely,
  readSignUpStatusSafely,
} from "@/components/landing/landing-copy";
import { LandingFooter } from "@/components/landing/landing-footer";
import { PlansSection } from "@/components/landing/plans-section";
import { Reveal } from "@/components/landing/reveal";
import { SourceBadge } from "@/components/source-badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "InvestIQ AI — calm, honest long-term investing",
  description: `${POSITIONING_LINE} Track portfolios across the US, Muscat, Tadawul and Dubai markets. Every number carries its source.`,
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
    body: "Purchases, sales, deposits, dividends received — you enter transactions and nothing else. No balances to maintain, no numbers to remember.",
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

  // Read on the server for every visit (the session read above already makes
  // this page render per request). If either can't be read, fall back to the
  // honest version: sign-ups shown as paused, Pro shown as not on sale.
  const signUpStatus = readSignUpStatusSafely(getSignUpStatus);
  const billingEnabled = readBillingEnabledSafely(() => isBillingEnabled());
  const contactEmail = getLegalContactEmail();

  return (
    <div className="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <p className="text-lg font-semibold tracking-tight">InvestIQ AI</p>
          <div className="flex items-center gap-1">
            <Link
              href="#plans"
              className="hidden min-h-11 items-center px-3 text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline md:inline-flex dark:text-slate-400 dark:hover:text-slate-50"
            >
              Plans
            </Link>
            <ThemeToggle placement="topbar" />
            <Button asChild variant="ghost" size="lg" className="px-3">
              <Link href="/sign-in">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero — shown straight away, never hidden behind the scroll reveal:
            it is the first thing a visitor sees, even before scripts load. */}
        <section className="mx-auto max-w-5xl px-6 pb-20 pt-20 text-center sm:pb-28 sm:pt-28">
          <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
            Long-term investing, minus the noise.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base text-slate-500 dark:text-slate-400 sm:text-lg">
            Track portfolios across New York, Muscat, Tadawul and Dubai. Your cash and dividends
            are worked out from what you actually did, and no number ever appears without saying
            where it came from.
          </p>
          <p className="mx-auto mt-4 max-w-2xl text-sm font-medium text-slate-900 dark:text-slate-50">
            {POSITIONING_LINE}
          </p>
          <div className="mt-10">
            <LandingCta signUpStatus={signUpStatus} />
          </div>
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
                    Before you decide, six AI analysts review the same data and each gives its
                    view. You see every view and every disagreement, not a smoothed-over summary.
                    Each analysis is saved with its date, model and data freshness, and is never
                    quietly regenerated behind your back.
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

        {/* Plans: Free and Pro — right after the AI section, so the visitor has
            just read what the AI does before seeing what it costs. */}
        <PlansSection billingEnabled={billingEnabled} signUpStatus={signUpStatus} />

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
                      className="inline-flex min-h-11 items-center text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
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
              <div className="mt-8">
                <LandingCta signUpStatus={signUpStatus} />
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      <LandingFooter contactEmail={contactEmail} />
    </div>
  );
}
