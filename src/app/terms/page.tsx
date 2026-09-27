// Public terms of use — no sign-in required (src/proxy.ts PUBLIC_PATHS).
import Link from "next/link";

import { getLegalContactEmail } from "@/lib/legal-contact";

export const metadata = { title: "Terms of Use — InvestIQ AI" };

const LAST_UPDATED = "July 19, 2026";

export default function TermsPage() {
  // Server component: read the contact address from the environment here.
  const contactEmail = getLegalContactEmail();

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/sign-in" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← Back to InvestIQ AI
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">Terms of Use</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Last updated: {LAST_UPDATED}</p>

      <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">
        This is a plain-English template, not a document written by a
        lawyer. A professional legal review happens once InvestIQ AI starts
        making money — until then, treat this as a fair description of how
        the app is meant to be used, not a legal guarantee.
      </p>

      <div className="mt-8 space-y-8 text-sm leading-6 text-slate-700 dark:text-slate-300">
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Using InvestIQ AI
          </h2>
          <p className="mt-2">
            InvestIQ AI is a personal tool for tracking your own long-term
            investment portfolio and organizing your own thinking about it.
            You may use it to record transactions, track a watchlist, write
            investment theses, and — where enabled — generate AI analysis of
            your own data. Accounts are for personal use; don&apos;t use the app
            to store or process anyone else&apos;s financial data without their
            permission.
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
            want to keep one.
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
            This app is currently a personal tool with a single operator. If
            you have questions about these terms, email{" "}
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
