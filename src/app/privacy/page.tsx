// Public privacy policy — no sign-in required (src/proxy.ts PUBLIC_PATHS).
// Written against exactly what prisma/schema.prisma stores today; when a
// diff adds a new personal field, it must update this page in the SAME
// change (docs/CONVENTIONS.md, engineering-standards.md §6).
import Link from "next/link";

export const metadata = { title: "Privacy Policy — InvestIQ AI" };

const LAST_UPDATED = "July 19, 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-4 py-10 sm:px-6">
      <Link href="/sign-in" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← Back to InvestIQ AI
      </Link>

      <h1 className="mt-6 text-2xl font-semibold">Privacy Policy</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Last updated: {LAST_UPDATED}</p>

      <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">
        This is a plain-English template, not a document written by a lawyer.
        It describes exactly what the app stores and does today. A
        professional legal review happens once InvestIQ AI starts making
        money — until then, treat this as an honest description, not a legal
        guarantee.
      </p>

      <div className="mt-8 space-y-8 text-sm leading-6 text-slate-700 dark:text-slate-300">
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            What this app is
          </h2>
          <p className="mt-2">
            InvestIQ AI is a personal long-term investing tool. You create an
            account, record your own portfolio transactions, and the app
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
              <strong>Sign-in sessions:</strong> when you signed in, the IP
              address and browser (user-agent string) that session came
              from. This is standard security bookkeeping — it lets us (and
              you, via the data download below) see your own sign-in
              history.
            </li>
            <li>
              <strong>Your portfolio:</strong> every transaction you record
              (buys, sells, dividends, deposits, withdrawals, fees) —
              amounts, dates, and the stock/ETF/REIT involved.
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
              committee reviews, buy/sell analyses and weekly reviews, when
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
              <strong>Resend</strong> (email delivery) — only if the
              operator has turned on the optional weekly-review email. When
              it is, your own email address is used to send you your own
              weekly review. Left off, no email is ever sent and Resend
              never sees anything.
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
            Your rights
          </h2>
          <p className="mt-2">
            You can download a complete copy of everything this app stores
            about you, or permanently delete your account and everything in
            it, at any time from the{" "}
            <Link href="/settings" className="text-blue-600 hover:underline dark:text-blue-400">
              Settings
            </Link>{" "}
            page — look for the &quot;Your data&quot; and &quot;Danger&quot; cards. Deleting your
            account removes your portfolio, transactions, theses, alerts and
            AI analyses with no undo.
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
            This app is currently a personal tool with a single operator. If
            you have questions about your data, contact the person who
            invited you to use it.
          </p>
        </section>
      </div>
    </main>
  );
}
