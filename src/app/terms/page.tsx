// Public terms of use — no sign-in required (src/proxy.ts PUBLIC_PATHS).
import Link from "next/link";
import { connection } from "next/server";

import { isBillingEnabled } from "@/lib/billing/config";
import { getLegalContactEmail } from "@/lib/legal-contact";
import { PLAN_FEATURES } from "@/lib/plans";
import { readBillingEnabledSafely } from "@/components/landing/landing-copy";
import {
  REFUND_LINE,
  TERMS_POSITIONING_SENTENCE,
  aiFairUseSentence,
  proPriceSentence,
  termsPaymentStatusSentence,
} from "@/components/landing/legal-copy";

export const metadata = { title: "Terms of Use — InvestIQ AI" };

const LAST_UPDATED = "September 30, 2026";

const sectionHeading = "text-lg font-semibold text-slate-900 dark:text-slate-50";

// What each plan includes today, read from PLAN_FEATURES (features that are
// still "coming soon" are left out of the terms until they exist).
const FREE_INCLUDES = PLAN_FEATURES.filter(
  (f) => f.plan === "FREE" && f.status === "available",
).map((f) => f.label);
const PRO_ADDS = PLAN_FEATURES.filter((f) => f.plan === "PRO" && f.status === "available").map(
  (f) => f.label,
);

export default async function TermsPage() {
  // Wait for a real request so the "is Pro on sale?" sentence follows the
  // live billing switch, not whatever was set when the app was built.
  await connection();
  const contactEmail = getLegalContactEmail();
  const billingEnabled = readBillingEnabledSafely(() => isBillingEnabled());

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/sign-in" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← Back to InvestIQ AI
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">Terms of Use</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Last updated: {LAST_UPDATED}</p>

      <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">
        This is a plain-English template, not a document written by a
        lawyer. A professional legal review happens before Pro goes on
        sale — until then, treat this as a fair description of how
        the app is meant to be used, not a legal guarantee.
      </p>

      <div className="mt-8 space-y-8 text-sm leading-6 text-slate-700 dark:text-slate-300">
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Using InvestIQ AI
          </h2>
          <p className="mt-2">
            InvestIQ AI is a tool for tracking your own long-term
            investment portfolio and organizing your own thinking about it.
            You may use it to record transactions, track a watchlist, write
            investment theses, and — where enabled — generate AI analysis of
            your own data. Accounts are for personal use; don&apos;t use the app
            to store or process anyone else&apos;s financial data without their
            permission.
          </p>
        </section>

        <section>
          <h2 className={sectionHeading}>Your account</h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>One person, one account, with one email address that you have confirmed.</li>
            <li>
              We may suspend or close accounts used abusively — for example
              mass sign-ups, or automated use of the AI features.
            </li>
          </ul>
        </section>

        <section>
          <h2 className={sectionHeading}>Plans and pricing</h2>
          <p className="mt-2">
            InvestIQ AI has two plans. Prices are in US dollars.
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong>Free</strong> ($0): {FREE_INCLUDES.join("; ")}.
            </li>
            <li>
              <strong>Pro</strong> ({proPriceSentence()}): everything in Free,
              plus {PRO_ADDS.join("; ")}.
            </li>
          </ul>
          <p className="mt-2">{aiFairUseSentence()}</p>
          <p className="mt-2 font-medium text-slate-900 dark:text-slate-50">
            {termsPaymentStatusSentence(billingEnabled)}
          </p>
        </section>

        <section>
          <h2 className={sectionHeading}>Paying for Pro, renewal and refunds</h2>
          <p className="mt-2">
            Pro renews automatically at the end of each month or year you
            chose, at the price shown when you subscribed, until you cancel.
          </p>
          <p className="mt-2">{REFUND_LINE}</p>
        </section>

        <section>
          <h2 className={sectionHeading}>If Pro ends</h2>
          <p className="mt-2">
            If you cancel, a payment fails for good, or Pro otherwise ends,
            your account moves to Free. You keep everything you saved,
            including analyses, reviews and thesis check-ups created while on
            Pro; only new Pro-only actions stop. If the Pro price changes, we
            will tell you in advance, before the new price applies to an
            existing subscription.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Not financial advice
          </h2>
          <p className="mt-2">
            This is analysis to support your own decision, not financial
            advice. Every number, score and AI-generated analysis in this
            app is meant to inform your own thinking — it is never a
            recommendation to buy, sell, or hold anything, and it should
            never be your only input for a financial decision. Market data
            can be delayed, manually entered, or sample data — the app
            always labels which, but you&apos;re responsible for confirming
            anything important before acting on it.
          </p>
          <p className="mt-2">{TERMS_POSITIONING_SENTENCE}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            No warranty
          </h2>
          <p className="mt-2">
            InvestIQ AI is provided &quot;as is,&quot; with no warranty of any kind.
            We do our best to keep the numbers accurate and the app running,
            but we don&apos;t guarantee it will be error-free, available at all
            times, or fit for any particular purpose. You use it at your own
            risk, and you&apos;re responsible for your own investment decisions.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Closing your account
          </h2>
          <p className="mt-2">
            You can close your account at any time from the{" "}
            <Link href="/settings" className="text-blue-600 hover:underline dark:text-blue-400">
              Settings
            </Link>{" "}
            page (&quot;Danger&quot; card). This permanently deletes your account,
            portfolio, transactions, theses, alerts and AI analyses — there
            is no undo, so make sure you&apos;ve downloaded a copy first if you
            want to keep one. If you have an active Pro subscription, it is
            cancelled first.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Changes to these terms
          </h2>
          <p className="mt-2">
            If these terms change in a meaningful way, the &quot;Last updated&quot;
            date above will change too. Continuing to use the app after a
            change means you accept the new terms.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Questions
          </h2>
          <p className="mt-2">
            InvestIQ AI is run by a single operator. If you have questions
            about these terms, email{" "}
            <a
              href={`mailto:${contactEmail}`}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              {contactEmail}
            </a>
            . See also the{" "}
            <Link href="/privacy" className="text-blue-600 hover:underline dark:text-blue-400">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
