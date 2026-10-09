"use client";

// Settings card: "Sharia screen" (sharia-screen-ui.md section 1). A two-button
// Off / On pair (the app has no switch). The server decides everything that
// matters: turning ON is refused for a Free person even if this screen is
// bypassed. This card only explains and reflects the saved state.

import * as React from "react";
import Link from "next/link";
import { Check, Loader2, Lock, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";

import { setShariaScreenEnabled } from "@/app/actions/sharia";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent } from "@/components/ui/tooltip";
import { PLANS_CARD_HREF } from "@/lib/ai/limit-messages";
import { cn } from "@/lib/utils";
import type { ShariaCardState } from "@/lib/sharia/card-state";
import type { BackfillOutcome } from "@/lib/sharia/preference";
import {
  CARD_ALREADY_HAVE,
  CARD_ERROR_RATE,
  CARD_ERROR_SERVER,
  CARD_ERROR_SIGN_IN,
  CARD_EXPLANATION,
  CARD_FETCHING,
  CARD_LABEL,
  CARD_NOT_SET_UP,
  CARD_PAUSED,
  CARD_PRIVACY,
  CARD_PRO,
  CARD_PRO_COMING_SOON,
  CARD_SAVED_OFF,
  CARD_SAVED_ON,
  CARD_SAVING,
  CARD_TITLE,
  CARD_TONIGHT,
} from "@/lib/sharia/wording";

function Notice({ icon, children, aside }: { icon: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300"
    >
      <span className="mt-0.5 shrink-0 text-slate-400">{icon}</span>
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
      {aside}
    </div>
  );
}

export function ShariaScreenCard({ state }: { state: ShariaCardState }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [pendingValue, setPendingValue] = React.useState<boolean | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState<{ enabled: boolean; backfill: BackfillOutcome } | null>(null);

  const selected = pendingValue ?? state.enabled;
  const locked = !state.isPro; // Free: cannot turn ON (turning OFF always works)
  const paused = locked && state.enabled;

  function choose(next: boolean) {
    if (next === selected || isPending) return;
    setPendingValue(next);
    setError(null);
    setSaved(null);
    startTransition(async () => {
      try {
        const result = await setShariaScreenEnabled(next);
        if (result.ok) {
          setSaved(result.data);
          router.refresh();
        } else if (result.code === "PRO_REQUIRED") {
          setError(result.error);
        } else if (result.error.startsWith("You need to be signed in")) {
          setError(CARD_ERROR_SIGN_IN);
        } else if (result.error.startsWith("Too many requests")) {
          setError(CARD_ERROR_RATE);
        } else {
          setError(result.error);
        }
      } catch {
        setError(CARD_ERROR_SERVER);
      } finally {
        setPendingValue(null);
      }
    });
  }

  const onDisabled = locked; // the On button is disabled for Free people
  const offDisabled = isPending || (locked && !state.enabled);
  const hint = state.billingEnabled ? "Part of Pro" : "Part of Pro, coming soon";

  const toggle = (
    <div
      role="group"
      aria-label={CARD_LABEL}
      className="flex w-full gap-0 sm:w-44"
    >
      <Tooltip className="flex-1">
        <Button
          type="button"
          size="lg"
          variant={selected ? "outline" : "default"}
          aria-pressed={!selected}
          disabled={offDisabled}
          onClick={() => choose(false)}
          className="min-w-22 flex-1 rounded-r-none"
        >
          {isPending && pendingValue === false ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          Off
        </Button>
        {locked && !state.enabled ? <TooltipContent side="bottom">{hint}</TooltipContent> : null}
      </Tooltip>
      <Tooltip className="flex-1">
        <Button
          type="button"
          size="lg"
          variant={selected ? "default" : "outline"}
          aria-pressed={selected}
          disabled={isPending || onDisabled}
          onClick={() => choose(true)}
          className="min-w-22 flex-1 rounded-l-none border-l-0"
        >
          {isPending && pendingValue === true ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
          On
        </Button>
        {locked ? <TooltipContent side="bottom">{hint}</TooltipContent> : null}
      </Tooltip>
    </div>
  );

  return (
    <Card id="sharia-screen">
      <CardHeader>
        <CardTitle>{CARD_TITLE}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0 space-y-2">
            <p className="flex items-center gap-2 text-base font-medium">
              {CARD_LABEL}
              {paused ? <Badge variant="secondary">Paused</Badge> : null}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{CARD_EXPLANATION}</p>
          </div>
          {toggle}
        </div>

        {/* Reserved 20px status line so the card doesn't jump. */}
        <div className="min-h-5 text-sm" aria-live="polite">
          {isPending ? (
            <span className="text-slate-500 dark:text-slate-400">{CARD_SAVING}</span>
          ) : saved ? (
            <span role="status" className="inline-flex items-center gap-1.5 text-green-700 dark:text-green-400">
              <Check className="size-4" aria-hidden="true" />
              {saved.enabled ? CARD_SAVED_ON : CARD_SAVED_OFF}
            </span>
          ) : null}
        </div>
        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}

        {/* Who sees what (states C to G). */}
        {!state.isPro && !state.enabled ? (
          state.billingEnabled ? (
            <Notice icon={<Lock className="size-4" aria-hidden="true" />}>
              <p>{CARD_PRO}</p>
              <Link
                href={PLANS_CARD_HREF}
                className="inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
              >
                See Pro plans
              </Link>
            </Notice>
          ) : (
            <Notice
              icon={<Lock className="size-4" aria-hidden="true" />}
              aside={<Badge variant="secondary">Coming soon</Badge>}
            >
              <p>{CARD_PRO_COMING_SOON}</p>
            </Notice>
          )
        ) : null}
        {paused ? (
          <Notice icon={<Lock className="size-4" aria-hidden="true" />}>
            <p>{CARD_PAUSED}</p>
          </Notice>
        ) : null}
        {state.isPro && !state.configured ? (
          <Notice icon={<ShieldOff className="size-4" aria-hidden="true" />}>
            <p>{CARD_NOT_SET_UP}</p>
          </Notice>
        ) : null}

        {/* What happened to the background fetch after switching ON. */}
        {saved?.enabled && saved.backfill === "started" ? (
          <Notice icon={<Loader2 className="size-4 animate-spin" aria-hidden="true" />}>
            <p>{CARD_FETCHING}</p>
            <Tooltip className="block">
              <Button type="button" variant="outline" size="lg" onClick={() => router.refresh()}>
                Check again
              </Button>
              <TooltipContent side="bottom">Reload to see the latest results</TooltipContent>
            </Tooltip>
          </Notice>
        ) : null}
        {saved?.enabled && saved.backfill === "nothing_to_fetch" ? (
          <p className={cn("text-xs text-slate-500 dark:text-slate-400")}>{CARD_ALREADY_HAVE}</p>
        ) : null}
        {saved?.enabled && saved.backfill === "rate_limited" ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{CARD_TONIGHT}</p>
        ) : null}

        <p className="text-xs text-slate-500 dark:text-slate-400">{CARD_PRIVACY}</p>
      </CardContent>
    </Card>
  );
}
