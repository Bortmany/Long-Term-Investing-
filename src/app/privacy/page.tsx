// Public privacy policy — no sign-in required (src/proxy.ts PUBLIC_PATHS).
// Written against exactly what prisma/schema.prisma stores today; when a
// diff adds a new personal field, it must update this page in the SAME
// change (docs/CONVENTIONS.md, engineering-standards.md §6).
import Link from "next/link";
import { connection } from "next/server";

import { isBillingEnabled } from "@/lib/billing/config";
import { getLegalContactEmail } from "@/lib/legal-contact";
import { readBillingEnabledSafely } from "@/components/landing/landing-copy";

export const metadata = { title: "Privacy Policy — InvestIQ AI" };

const LAST_UPDATED = "October 4, 2026";

export default async function PrivacyPage() {
  // Wait for a real request so the payments sentence and the contact address
  // reflect the live settings, not whatever was set when the app was built.
  await connection();
  const contactEmail = getLegalContactEmail();
  const billingEnabled = readBillingEnabledSafely(() => isBillingEnabled());

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <Link
        href="/sign-in"
        className="inline-flex min-h-11 items-center text-sm text-blue-600 hover:underline dark:text-blue-400"
      >
        ← Back to InvestIQ AI
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">Privacy Policy</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Last updated: {LAST_UPDATED}</p>

      <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">
        This is a plain-English template, not a document written by a lawyer.
        It describes exactly what the app stores and does today. A
        professional legal review happens before Pro goes on sale — until
        then, treat this as an honest description, not a legal
        guarantee.
      </p>

      <div className="mt-8 space-y-8 text-sm leading-6 text-slate-700 dark:text-slate-300">
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            What this app is
          </h2>
          <p className="mt-2">
            InvestIQ AI is portfolio tracking and research software, not
            personalised advice. You create an account, record your own
            portfolio transactions, and the app
            works out holdings, cash and returns, and — where you turn AI on
            — analysis of your own portfolio and stock theses. This policy
            explains what we store about you and why.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            What we store
          </h2>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong>Your account:</strong> your name, email address, and a
              one-way password hash (never your actual password — we
              literally cannot read it back).
            </li>
            <li>
              <strong>Email confirmation:</strong> whether you have confirmed
              your email address. When you sign up or ask to reset your
              password, we keep a short-lived record (which email or account
              it is for, a random one-time code, and when it expires) so the
              link in the email works. These records are deleted when used or
              stop working when they expire.
            </li>
            <li>
              <strong>Your plan:</strong> whether you are on Free or Pro.
            </li>
            <li>
              <strong>Billing details, only if you pay for Pro:</strong> the
              payment provider&apos;s name (Stripe), the customer and
              subscription reference numbers Stripe gives us, your
              subscription&apos;s status, whether you pay monthly or yearly,
              when the current period ends, and whether it is set to cancel.
              We also keep a list of the payment events we have already
              handled (just Stripe&apos;s event reference and its type, nothing
              about you), so the same event is never applied twice.{" "}
              <strong>
                Your card details are typed into Stripe&apos;s own page and never
                reach or get stored by InvestIQ.
              </strong>
            </li>
            <li>
              <strong>Sign-in sessions:</strong> when you signed in, the IP
              address and browser (user-agent string) that session came
              from. This is standard security bookkeeping — it lets us (and
              you, via the data download below) see your own sign-in
              history.
            </li>
            <li>
              <strong>Your portfolio:</strong> every transaction you record
              (purchases, sales, dividends, deposits, withdrawals, fees) —
              amounts, dates, and the stock/ETF/REIT involved. For trades you
              import from a broker file, we also keep an import reference —
              your broker&apos;s own transaction id, or a short fingerprint of
              the line when the file has no id. It is stored only so the same
              trade is not added twice, appears in your data download, and is
              deleted with your account.
            </li>
            <li>
              <strong>Your Interactive Brokers connection, only if you connect
              it:</strong> your read-only IBKR token (stored scrambled with
              strong encryption and never shown to you again), your Query ID,
              your IBKR account number (only its last four characters are ever
              shown on screen), the optional token expiry date you type in, a
              history of each sync (when it ran, how many trades were added,
              already there or skipped, and a short message), and a &quot;From
              broker&quot; tag on the trades a sync brings in. We never save
              IBKR&apos;s report itself; only the trades we add to your
              portfolio. The token can only download reports: InvestIQ has no
              ability to place trades or move money.
            </li>
            <li>
              <strong>Prices and exchange rates you enter by hand</strong> —
              when you record a manual price for a stock, or a currency
              exchange rate, we store it against your account. These are yours
              alone: they are only ever used to value your own portfolio, never
              shown to or mixed with anyone else&apos;s.
            </li>
            <li>
              <strong>Your Sharia screen choice</strong> — whether you
              switched the optional Sharia screen badge on. It is off unless
              you turn it on. Switching it on says something about your
              beliefs, so we keep it to a simple on/off choice on your
              account, use it only to decide whether to show you the badge,
              and never share it with anyone.
            </li>
            <li>
              <strong>Sharia screening results</strong> for stocks — shared
              reference data from our screening supplier (verdict, method,
              date). Not linked to any person.
            </li>
            <li>
              <strong>Your watchlist</strong> — the stocks you&apos;re tracking
              and any notes you add.
            </li>
            <li>
              <strong>Your investment theses and thesis checks</strong> — the
              reasoning you write down for why you hold a stock, and the
              AI-generated integrity checks run against it.
            </li>
            <li>
              <strong>AI analyses of your portfolio</strong> — health scores,
              committee reviews, upside/downside checks and weekly reviews, when
              you generate them (only available when an AI key is
              configured — see below).
            </li>
            <li>
              <strong>Alerts and notifications</strong> — the price/thesis
              alerts you set up and the notifications they produce.
            </li>
            <li>
              <strong>Server logs</strong> — structured logs of app activity
              and errors, used only to debug problems. The logging system
              automatically blanks out anything that looks like a password,
              token or API key before it&apos;s ever written down.
            </li>
          </ul>
          <p className="mt-3">
            Nothing else is stored for plans or AI limits: how many AI
            analyses you have used today is counted from the analyses already
            saved above.
          </p>
          <p className="mt-3">
            We never store a made-up or estimated figure as if it were real —
            every number the app shows carries a label saying where it came
            from (live market data, something you entered by hand, or sample
            demo data).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Who else sees your data
          </h2>
          <p className="mt-2">
            InvestIQ AI does not sell your data or share it for advertising.
            A short list of outside services are used, and only ever for the
            specific job named here:
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong>Anthropic</strong> (the AI provider) — only if the
              app&apos;s operator has configured an AI key. When it is, the
              content you&apos;re analyzing (your portfolio numbers or thesis
              text) is sent to Anthropic to generate that one analysis. No
              key configured means no AI features run and nothing is ever
              sent.
            </li>
            <li>
              <strong>Financial Modeling Prep</strong> — used to fetch live
              stock prices and company fundamentals. Only ticker symbols
              (e.g. &quot;AAPL&quot;) are sent — never anything about you personally.
            </li>
            <li>
              <strong>Twelve Data</strong> — used to fetch share prices for
              some Gulf markets, only if the app&apos;s operator has
              configured a key. When it is, only ticker symbols (with the
              exchange name) are sent — never anything about you personally.
              No key configured means nothing is ever sent.
            </li>
            <li>
              <strong>Resend</strong> (email delivery) — sends your account
              emails (confirm your email address, reset your password) and,
              if you are on Pro and it is turned on, your weekly review. For
              this it receives your email address and your name. If email
              delivery isn&apos;t set up, no email is sent and Resend never
              sees anything.
            </li>
            <li>
              <strong>Stripe</strong> (payments) — only when payments are
              turned on and you choose to pay for Pro. Stripe receives your
              email address and the plan you choose, takes your card details
              on its own page, and acts as our reseller (you may see it shown
              as &quot;Link&quot;). {billingEnabled
                ? "Payments are turned on."
                : "Payments are not turned on yet, so nothing is sent to Stripe."}
            </li>
            <li>
              <strong>Interactive Brokers</strong> — only if you connect
              it. We send your token and Query ID to IBKR&apos;s report
              service over an encrypted connection (that is how IBKR knows
              whose report to give us). IBKR does not receive anything else
              about you or your InvestIQ portfolio. If the connection is not
              switched on for this server, nothing is ever sent.
            </li>
            <li>
              <strong>Musaffa</strong> (Sharia screening data) — only if the
              operator has turned it on. Our server asks it about company
              ticker symbols and exchange names. Nothing about you, and not
              whether you use the badge, is sent.
            </li>
            <li>
              <strong>Sentry</strong> (error tracking) — only if the
              operator has configured it. When it is, details about server
              errors (not your portfolio data) help fix bugs faster.
            </li>
            <li>
              <strong>The hosting provider</strong> running the app and its
              database, the way any website needs a server to run on.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Cookies
          </h2>
          <p className="mt-2">
            The app sets two cookies and nothing for advertising or tracking:
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-5">
            <li>
              <strong>A sign-in cookie</strong> that keeps you signed in. It
              points to your sign-in session described above.
            </li>
            <li>
              <strong>A small security cookie</strong> (<code>iq_anon</code>)
              holding a random, signed code. It is used only to limit how
              often sign-in and sign-up can be tried from one browser, and
              contains no personal data.
            </li>
          </ul>
          <p className="mt-3">
            <strong>Public stock pages:</strong> to block abuse we count
            requests per visitor address in memory for about a minute; we do
            not save it and we set no cookie on those pages.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Your rights
          </h2>
          <p className="mt-2">
            You can download a complete copy of everything this app stores
            about you, or permanently delete your account and everything in
            it, at any time from the{" "}
            <Link href="/settings" className="inline-flex min-h-11 items-center text-blue-600 hover:underline dark:text-blue-400">
              Settings
            </Link>{" "}
            page — look for the &quot;Your data&quot; and &quot;Danger&quot; cards. The download
            includes your plan and any subscription details. Deleting your
            account removes your portfolio, transactions, theses, alerts, AI
            analyses, plan and billing details with no undo. If you have an
            active Pro subscription, it is cancelled first, so you are never
            charged again for an account that no longer exists.
          </p>
          <p className="mt-2">
            If you connected Interactive Brokers: pressing Disconnect deletes
            your saved token immediately, and deleting your account deletes the
            connection, the token and the sync history. The data download
            includes your connection details and sync history but never the
            token. We can&apos;t cancel a token inside IBKR; to be sure it can
            never be used, also delete it in IBKR&apos;s Flex Web Service
            settings.
          </p>
          <p className="mt-2">
            If InvestIQ AI is used from Oman, these rights are consistent
            with Oman&apos;s Personal Data Protection Law (Royal Decree 6/2022) —
            access to your data and the ability to have it deleted.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Questions
          </h2>
          <p className="mt-2">
            InvestIQ AI is run by a single operator. If you have questions
            about your data, email{" "}
            <a
              href={`mailto:${contactEmail}`} className="inline-flex min-h-11 items-center text-blue-600 hover:underline dark:text-blue-400"
            >
              {contactEmail}
            </a>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
