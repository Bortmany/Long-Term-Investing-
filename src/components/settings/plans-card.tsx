"use client";

// Settings "Plans & billing" card (go-public-ui.md §3; go-public spec B3).
//
// Shows the plan, this period's AI usage (from the SAME function that
// enforces the limits — see src/lib/billing/plans-card-data.ts) and what the
// plan includes. While payments are OFF (the launch state) it never shows a
// price button, a checkout, or "Manage billing": Pro is honestly "coming
// soon". Every block marked DORMANT below renders only while billing is ON.
//
// Returning from Stripe with ?billing=success NEVER grants Pro here: the card
// only re-reads the server a few times, waiting for the verified webhook.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Circle, CircleCheck, LoaderCircle, Lock, TriangleAlert, X } from "lucide-react";

import { openBillingPortal, startCheckout } from "@/app/actions/billing";
import { UsageBar } from "@/components/settings/usage-bar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PlansCardData } from "@/lib/billing/plans-card-data";
import { PLAN_FEATURES, PRICING, type PlanFeature } from "@/lib/plans";

const DAILY_RESET_LINE = "Resets at midnight UTC. That's 4:00 am in Oman.";
const MONTHLY_RESET_LINE = "Resets at midnight UTC on the 1st.";
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_TRIES = 5;

function FeatureRow({ feature, locked }: { feature: PlanFeature; locked: boolean }) {
  const comingSoon = feature.status === "coming_soon";
  const Icon = locked ? Lock : comingSoon ? Circle : Check;
  return (
    <li className="flex items-start gap-2 text-sm">
      <Icon
        className={
          locked
            ? "mt-0.5 size-4 shrink-0 text-slate-400"
            : comingSoon
              ? "mt-0.5 size-4 shrink-0 text-slate-400"
              : "mt-0.5 size-4 shrink-0 text-slate-600 dark:text-slate-400"
        }
        aria-hidden="true"
      />
      <span
        className={
          locked || comingSoon
            ? "flex-1 text-slate-500 dark:text-slate-400"
            : "flex-1 text-slate-700 dark:text-slate-300"
        }
      >
        {feature.label}
      </span>
      {comingSoon ? (
        <Badge variant="outline" className="shrink-0">
          Coming later
        </Badge>
      ) : null}
    </li>
  );
}

function CardShell({
  planBadge,
  children,
}: {
  planBadge?: "FREE" | "PRO";
  children: React.ReactNode;
}) {
  return (
    <Card id="plans" className="scroll-mt-6">
      <CardHeader className="flex-row items-center justify-between gap-4">
        <CardTitle>Plans &amp; billing</CardTitle>
        {planBadge === "PRO" ? <Badge>Pro</Badge> : null}
        {planBadge === "FREE" ? <Badge variant="secondary">Free</Badge> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function PlansCard({
  data,
  checkoutReturn,
  contactEmail,
}: {
  data: PlansCardData;
  /** From ?billing=… on the settings URL; only acted on while billing is on. */
  checkoutReturn: "success" | "cancelled" | null;
  contactEmail: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"month" | "year" | "portal" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [tries, setTries] = React.useState(0);
  const [thanksDismissed, setThanksDismissed] = React.useState(false);

  const billingOn = data.ok && data.billingEnabled;
  const activating = billingOn && checkoutReturn === "success" && data.ok && data.plan === "FREE";

  // State J (DORMANT): re-read the server a few times while the webhook lands.
  React.useEffect(() => {
    if (!activating || tries >= POLL_MAX_TRIES) return;
    const timer = setTimeout(() => {
      setTries((n) => n + 1);
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [activating, tries, router]);

  // State D: the plan or usage couldn't be read. Never a guessed number.
  if (!data.ok) {
    return (
      <CardShell>
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            <p>We couldn&apos;t load your plan just now.</p>
          </AlertDescription>
        </Alert>
        <Button type="button" variant="outline" size="lg" onClick={() => router.refresh()}>
          Try again
        </Button>
      </CardShell>
    );
  }

  const isPro = data.plan === "PRO";
  const sub = data.subscription;

  function goToCheckout(interval: "month" | "year") {
    if (pending) return;
    setError(null);
    setPending(interval);
    void startCheckout(interval).then((result) => {
      if (result.ok) {
        // Full-page navigation to Stripe's hosted page (keeps "pending" on
        // while the browser leaves).
        window.location.assign(result.data.url);
      } else {
        setError(result.error);
        setPending(null);
      }
    });
  }

  function goToPortal() {
    if (pending) return;
    setError(null);
    setPending("portal");
    void openBillingPortal().then((result) => {
      if (result.ok) {
        window.location.assign(result.data.url);
      } else {
        setError(result.error);
        setPending(null);
      }
    });
  }

  // --- The one-sentence state line -----------------------------------------
  let stateLine: React.ReactNode;
  let subLine: React.ReactNode = null;
  let pastDue = false;
  if (!isPro) {
    stateLine = billingOn
      ? `You're on the Free plan. Pro is $${PRICING.proMonthlyUsd} a month or $${PRICING.proYearlyUsd} a year.`
      : "You're on the Free plan.";
  } else if (data.ownerGranted || !sub) {
    stateLine = data.ownerGranted
      ? "You're on the Pro plan (added by the InvestIQ team)."
      : "You're on the Pro plan.";
  } else if (sub.status === "past_due") {
    pastDue = true;
    stateLine = "You're on the Pro plan.";
  } else if (sub.cancelAtPeriodEnd || sub.status === "canceled") {
    stateLine = sub.periodEndLabel
      ? `Pro ends on ${sub.periodEndLabel}. You keep Pro until then.`
      : "Your Pro plan is set to end. You keep Pro until the end of the period you paid for.";
    subLine = "After that you'll move to Free. Everything you've saved stays.";
  } else {
    const price =
      sub.interval === "year"
        ? `Pro plan, $${PRICING.proYearlyUsd} a year.`
        : `Pro plan, $${PRICING.proMonthlyUsd} a month.`;
    stateLine = sub.periodEndLabel ? `${price} Renews on ${sub.periodEndLabel}.` : price;
  }

  const included = PLAN_FEATURES.filter((f) =>
    isPro ? f.key !== "ai-free" : f.plan === "FREE",
  );
  const proAdds = isPro ? [] : PLAN_FEATURES.filter((f) => f.plan === "PRO");

  const showUpgradeButtons = billingOn && !isPro && !activating;
  const showManageBilling = billingOn && isPro && !data.ownerGranted && sub !== null;
  const showThanks = billingOn && checkoutReturn === "success" && isPro && !thanksDismissed;

  return (
    <CardShell planBadge={data.plan}>
      {/* J — DORMANT: back from Stripe, waiting for the verified webhook. */}
      {activating ? (
        <div
          aria-live="polite"
          className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
        >
          {tries < POLL_MAX_TRIES ? (
            <>
              <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden="true" />
              <p>Payment received. We&apos;re activating Pro. This usually takes a few seconds.</p>
            </>
          ) : (
            <p>
              This is taking longer than usual. Refresh in a minute; if Pro still isn&apos;t on,
              contact {contactEmail}.
            </p>
          )}
        </div>
      ) : null}

      {/* J → F — DORMANT: Pro arrived. */}
      {showThanks ? (
        <Alert variant="success" className="pr-12">
          <CircleCheck aria-hidden="true" />
          <AlertDescription>
            <p>You&apos;re on Pro. Thank you!</p>
          </AlertDescription>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute top-0 right-0"
            aria-label="Dismiss"
            onClick={() => setThanksDismissed(true)}
          >
            <X aria-hidden="true" />
          </Button>
        </Alert>
      ) : null}

      {/* K — DORMANT: back from Stripe without paying. */}
      {billingOn && checkoutReturn === "cancelled" && !isPro ? (
        <Alert>
          <AlertDescription>
            <p>No payment was taken.</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* H — DORMANT: payment failed, Pro kept until the period end. */}
      {billingOn && pastDue ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            <p>
              {sub?.periodEndLabel
                ? `We couldn't take your latest payment. You keep Pro until ${sub.periodEndLabel}.`
                : "We couldn't take your latest payment. You keep Pro until the end of the period you paid for."}
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {activating ? null : (
        <div className="space-y-1">
          <p className="text-sm text-slate-700 dark:text-slate-300">{stateLine}</p>
          {subLine ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{subLine}</p>
          ) : null}
        </div>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-4">
          <UsageBar
            label="New AI analyses today"
            used={data.usage.usedToday}
            limit={data.usage.dailyLimit}
            resetLine={DAILY_RESET_LINE}
          />
          {data.usage.monthlyLimit !== null && data.usage.usedThisMonth !== null ? (
            <UsageBar
              label="New AI analyses this month"
              used={data.usage.usedThisMonth}
              limit={data.usage.monthlyLimit}
              resetLine={MONTHLY_RESET_LINE}
            />
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">What&apos;s included</h3>
            <ul className="space-y-2">
              {included.map((feature) => (
                <FeatureRow key={feature.key} feature={feature} locked={false} />
              ))}
            </ul>
          </div>
          {proAdds.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Pro adds</h3>
              <ul className="space-y-2">
                {proAdds.map((feature) => (
                  <FeatureRow key={feature.key} feature={feature} locked />
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>

      {/* A: the "coming soon" teaser — billing OFF, Free. No buttons at all. */}
      {!billingOn && !isPro ? (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Pro is coming soon: ${PRICING.proMonthlyUsd} a month or ${PRICING.proYearlyUsd} a
              year. It adds 10 AI analyses a day, the full Investment Committee, thesis check-ups,
              the weekly AI review and &apos;time to review&apos; alerts.
            </p>
            <Badge variant="secondary" className="shrink-0">
              Coming soon
            </Badge>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Nothing to buy yet. Enjoy Free, and your saved work is always yours.
          </p>
        </div>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            <p>{error}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {/* E / K — DORMANT: upgrade buttons, billing ON only. */}
      {showUpgradeButtons ? (
        <div className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              size="lg"
              disabled={pending !== null}
              onClick={() => goToCheckout("month")}
            >
              {pending === "month" ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Opening secure checkout…
                </>
              ) : (
                `Upgrade: $${PRICING.proMonthlyUsd}/month`
              )}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              disabled={pending !== null}
              onClick={() => goToCheckout("year")}
            >
              {pending === "year" ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Opening secure checkout…
                </>
              ) : (
                `Upgrade: $${PRICING.proYearlyUsd}/year (save about 26%)`
              )}
            </Button>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            You&apos;ll go to Stripe&apos;s secure page to pay. We never see your card details.
          </p>
        </div>
      ) : null}

      {/* F / G / H — DORMANT: Manage billing, billing ON with a subscription. */}
      {showManageBilling ? (
        <Tooltip>
          {/* The button itself takes keyboard focus (which also shows the hint). */}
          <TooltipTrigger tabIndex={-1}>
            <Button
              type="button"
              size="lg"
              variant={pastDue ? "default" : "outline"}
              disabled={pending !== null}
              onClick={goToPortal}
            >
              {pending === "portal" ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Opening…
                </>
              ) : (
                "Manage billing"
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            Opens Stripe&apos;s page where you can change your card, see receipts or cancel.
          </TooltipContent>
        </Tooltip>
      ) : null}
    </CardShell>
  );
}
