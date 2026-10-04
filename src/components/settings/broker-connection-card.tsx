"use client";

// Settings "Broker connection" card (broker-connection-ui.md). Read-only
// Interactive Brokers connection: connect once, press Sync now, trades arrive.
//
// Which state shows is decided on the SERVER (src/lib/broker/card-state.ts)
// and passed in. This component only draws it and calls the three server
// actions. The token is typed into a box, sent once, and the box is emptied
// straight away; the card never receives a token or any scrambled form of it.
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  CircleCheck,
  Circle,
  Clock,
  Eye,
  EyeOff,
  Link2,
  LoaderCircle,
  Lock,
  PlugZap,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  X,
} from "lucide-react";

import { connectBroker, disconnectBroker, syncBrokerNow } from "@/app/actions/broker";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FLEX_QUERY_FIELDS } from "@/lib/broker/ibkr-flex/fields";
import { formatUtcDate, formatUtcDateTime } from "@/lib/broker/format";
import type { BrokerCardState, BrokerConnectionView } from "@/lib/broker/types";

const COOLDOWN_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const POLL_WHILE_SYNCING_MS = 5000;

const linkClass =
  "inline-flex min-h-11 items-center text-sm text-blue-600 underline-offset-4 hover:underline dark:text-blue-400";

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function InitialsChip() {
  return (
    <div
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold dark:bg-slate-800"
    >
      IB
    </div>
  );
}

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

export function BrokerConnectionCard({ state }: { state: BrokerCardState }) {
  const router = useRouter();
  const [notice, setNotice] = React.useState<{ kind: "success" | "info"; text: string } | null>(null);
  const [syncError, setSyncError] = React.useState<string | null>(null);
  const [connectOpen, setConnectOpen] = React.useState(false);
  const [disconnectOpen, setDisconnectOpen] = React.useState(false);
  const [isSyncing, startSync] = React.useTransition();
  const noticeRef = React.useRef<HTMLDivElement>(null);

  const connection =
    state.kind === "not_connected" ? null : state.connection;
  const serverSyncing = connection?.syncing ?? false;

  // The "now" clock starts empty so the server and browser draw the same
  // first frame; it only ticks while a cooldown is running.
  const [now, setNow] = React.useState<number | null>(null);
  React.useEffect(() => {
    // Read the clock inside a timer callback (never straight in the effect).
    const id = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(id);
  }, [connection?.lastAttemptAt]);
  const cooldownEnds = connection?.lastAttemptAt
    ? new Date(connection.lastAttemptAt).getTime() + COOLDOWN_MS
    : 0;
  const inCooldown = now !== null && now < cooldownEnds;
  React.useEffect(() => {
    if (!inCooldown) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [inCooldown]);

  // A sync running somewhere else (another tab): keep re-reading the server.
  React.useEffect(() => {
    if (!serverSyncing || isSyncing) return;
    const id = window.setInterval(() => router.refresh(), POLL_WHILE_SYNCING_MS);
    return () => window.clearInterval(id);
  }, [serverSyncing, isSyncing, router]);

  React.useEffect(() => {
    if (notice?.kind === "success") noticeRef.current?.focus();
  }, [notice]);

  function syncNow() {
    setSyncError(null);
    setNotice(null);
    startSync(async () => {
      const result = await syncBrokerNow();
      if (!result.ok) {
        setSyncError(result.error);
      } else if (result.data.status === "SUCCEEDED") {
        setNotice({
          kind: "info",
          text:
            result.data.rowsAdded > 0
              ? `Sync finished. ${plural(result.data.rowsAdded, "new trade", "new trades")} added.`
              : "Sync finished. You're up to date.",
        });
      }
      router.refresh();
    });
  }

  const syncing = isSyncing || serverSyncing;

  // --- header badge ---
  let badge: React.ReactNode = null;
  if (state.kind === "dormant") badge = <Badge variant="secondary">Not switched on</Badge>;
  else if (state.kind === "free") badge = <Badge variant="secondary">Pro</Badge>;
  else if (state.kind === "connection") {
    if (syncing) {
      badge = (
        <Badge variant="outline">
          <LoaderCircle className="animate-spin" aria-hidden="true" />
          Syncing
        </Badge>
      );
    } else if (state.connection.status === "NEEDS_RECONNECT") {
      badge = (
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400"
        >
          Needs reconnect
        </Badge>
      );
    } else {
      badge = (
        <Badge variant="outline">
          <span className="size-1.5 rounded-full bg-green-500" aria-hidden="true" />
          Connected
        </Badge>
      );
    }
  }

  return (
    <Card id="broker-connection" className="scroll-mt-4">
      <CardHeader className="flex-row items-center justify-between gap-3">
        <CardTitle>Broker connection</CardTitle>
        {badge}
      </CardHeader>
      <CardContent className="space-y-4" aria-live="polite">
        {notice ? (
          <div ref={noticeRef} tabIndex={-1} className="outline-none">
            <Alert variant={notice.kind === "success" ? "success" : "default"} role="status">
              <CircleCheck aria-hidden="true" />
              <AlertDescription className="flex items-start justify-between gap-2">
                <span>{notice.text}</span>
                <Tooltip>
                  <TooltipTrigger tabIndex={-1}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setNotice(null)}
                    >
                      <X aria-hidden="true" />
                      <span className="sr-only">Dismiss</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left" aria-hidden="true">
                    Hide this message
                  </TooltipContent>
                </Tooltip>
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {state.kind === "dormant" ? <DormantBody connection={state.connection} /> : null}

        {state.kind === "free" ? (
          <FreeBody billingEnabled={state.billingEnabled} connection={state.connection} />
        ) : null}

        {state.kind === "not_connected" ? (
          <NotConnectedBody onConnect={() => setConnectOpen(true)} />
        ) : null}

        {state.kind === "connection" ? (
          <ConnectionBody
            connection={state.connection}
            syncing={syncing}
            nowMs={now}
            inCooldown={inCooldown}
            syncError={syncError}
            onSync={syncNow}
            onReconnect={() => setConnectOpen(true)}
            onDisconnect={() => setDisconnectOpen(true)}
          />
        ) : null}

        {/* Saved connection in the dormant / Free states: only Disconnect. */}
        {(state.kind === "dormant" || state.kind === "free") && state.connection ? (
          <div className="space-y-4">
            <ConnectionTile connection={state.connection} syncing={false} nowMs={now} />
            <DisconnectButton onClick={() => setDisconnectOpen(true)} disabled={false} />
          </div>
        ) : null}
      </CardContent>

      {connectOpen ? (
        <ConnectDialog
          reconnectQueryId={
            state.kind === "connection" && state.connection.status === "NEEDS_RECONNECT"
              ? state.connection.queryId
              : null
          }
          onClose={() => setConnectOpen(false)}
          onConnected={(text) => {
            setConnectOpen(false);
            setSyncError(null);
            setNotice({ kind: "success", text });
            router.refresh();
          }}
        />
      ) : null}

      {disconnectOpen ? (
        <DisconnectDialog
          onClose={() => setDisconnectOpen(false)}
          onDone={(already) => {
            setDisconnectOpen(false);
            setSyncError(null);
            setNotice({
              kind: "success",
              text: already ? "Already disconnected." : "Disconnected. Your saved token has been deleted.",
            });
            router.refresh();
          }}
        />
      ) : null}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Bodies for each state
// ---------------------------------------------------------------------------

function DormantBody({ connection }: { connection: BrokerConnectionView | null }) {
  void connection;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <PlugZap className="size-6 text-slate-400" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-medium">Broker connection isn&apos;t switched on for this server yet.</p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            The site owner needs to finish setting it up. Until then, import your trades from a file instead.
          </p>
        </div>
      </div>
      <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
        <Link href="/portfolio/import">Import from a file</Link>
      </Button>
    </div>
  );
}

function FreeBody({
  billingEnabled,
  connection,
}: {
  billingEnabled: boolean;
  connection: BrokerConnectionView | null;
}) {
  void connection;
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
        <Lock className="size-6 shrink-0 text-slate-400" aria-hidden="true" />
        <div className="space-y-2">
          <h3 className="text-base font-semibold">This is part of Pro</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {billingEnabled
              ? "Connect Interactive Brokers read-only and sync your trades. Upgrade to Pro to use it."
              : "Connect Interactive Brokers read-only and sync your trades. Pro is coming soon."}
          </p>
          {billingEnabled ? (
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/settings#plans">See Pro plans</Link>
            </Button>
          ) : null}
        </div>
      </div>
      <Link href="/portfolio/import" className={linkClass}>
        Other brokers, or no Pro? Import a file instead
      </Link>
    </div>
  );
}

function NotConnectedBody({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <Link2 className="size-7 text-slate-400" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Bring in your Interactive Brokers trades</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Connect once, press Sync now, and your history catches up.
          </p>
        </div>
      </div>
      <ul className="space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-slate-600 dark:text-slate-400" aria-hidden="true" />
          You give InvestIQ a read-only token from IBKR. It can only download reports.
        </li>
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-slate-600 dark:text-slate-400" aria-hidden="true" />
          It cannot place trades, move money or change anything in your IBKR account.
        </li>
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-slate-600 dark:text-slate-400" aria-hidden="true" />
          Disconnect any time. You can also delete the token inside IBKR.
        </li>
      </ul>
      <Button type="button" size="lg" className="w-full sm:w-auto" onClick={onConnect}>
        Connect Interactive Brokers
      </Button>
      <div>
        <Link href="/portfolio/import" className={linkClass}>
          Other brokers? Import a file instead
        </Link>
      </div>
    </div>
  );
}

function DisconnectButton({ onClick, disabled }: { onClick: () => void; disabled: boolean }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="lg"
      disabled={disabled}
      onClick={onClick}
      className="w-full text-red-600 hover:bg-red-50 hover:text-red-700 sm:w-auto dark:text-red-400 dark:hover:bg-red-950"
    >
      Disconnect
    </Button>
  );
}

function ConnectionBody({
  connection,
  syncing,
  nowMs,
  inCooldown,
  syncError,
  onSync,
  onReconnect,
  onDisconnect,
}: {
  connection: BrokerConnectionView;
  syncing: boolean;
  nowMs: number | null;
  inCooldown: boolean;
  syncError: string | null;
  onSync: () => void;
  onReconnect: () => void;
  onDisconnect: () => void;
}) {
  const needsReconnect = connection.status === "NEEDS_RECONNECT";
  const lastFailed =
    !needsReconnect && connection.lastRun !== null && connection.lastRun.status === "FAILED" && connection.lastFailureMessage;
  const code = connection.lastFailureCode;

  return (
    <div className="space-y-4">
      {needsReconnect ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Interactive Brokers no longer accepts your token</AlertTitle>
          <AlertDescription>
            <p>
              {connection.lastFailureMessage ??
                "This happens when it expires or when you create a new one in IBKR. Create a new token and reconnect."}
            </p>
            <p className="text-slate-500 dark:text-slate-400">Your existing trades are untouched.</p>
          </AlertDescription>
        </Alert>
      ) : null}

      {lastFailed ? (
        <Alert variant="warning">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>{code === "needs_older_history" ? "We didn't add anything" : "Couldn't sync just now"}</AlertTitle>
          <AlertDescription>
            <p>{connection.lastFailureMessage}</p>
            {code === "untracked_tickers" ? (
              <Button asChild variant="outline" size="lg">
                <Link href="/stocks">Track a stock</Link>
              </Button>
            ) : null}
            {code === "needs_older_history" ? (
              <Button asChild variant="outline" size="lg">
                <Link href="/portfolio/import">Import older trades from a file</Link>
              </Button>
            ) : null}
            {connection.lastAttemptAt ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tried {formatUtcDateTime(connection.lastAttemptAt)}.
              </p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}

      {syncError ? (
        <Alert>
          <AlertDescription>
            <p>{syncError}</p>
          </AlertDescription>
        </Alert>
      ) : null}

      <ConnectionTile connection={connection} syncing={syncing} nowMs={nowMs} failedLast={Boolean(lastFailed) || needsReconnect} />

      <div className="flex flex-col gap-3 sm:flex-row">
        {needsReconnect ? (
          <Button type="button" size="lg" className="w-full sm:w-auto" onClick={onReconnect}>
            Reconnect
          </Button>
        ) : (
          <Tooltip className="block sm:inline-flex">
            <TooltipTrigger tabIndex={-1} className="block w-full sm:inline-flex sm:w-auto">
              <span className="block w-full sm:inline-block sm:w-auto">
                <Button
                  type="button"
                  size="lg"
                  className="w-full sm:w-auto"
                  disabled={syncing || inCooldown}
                  onClick={onSync}
                >
                  {syncing ? (
                    <LoaderCircle className="animate-spin" aria-hidden="true" />
                  ) : (
                    <RefreshCw aria-hidden="true" />
                  )}
                  {inCooldown && !syncing ? "Synced moments ago" : lastFailed ? "Try again" : "Sync now"}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              {syncing
                ? "A sync is running."
                : inCooldown
                  ? "You can sync again in a minute."
                  : "Fetch any new trades from Interactive Brokers."}
            </TooltipContent>
          </Tooltip>
        )}
        <DisconnectButton onClick={onDisconnect} disabled={syncing} />
      </div>
    </div>
  );
}

function ConnectionTile({
  connection,
  syncing,
  nowMs,
  failedLast = false,
}: {
  connection: BrokerConnectionView;
  syncing: boolean;
  /** The browser clock (null until it is read, so the first frame matches the server). */
  nowMs: number | null;
  failedLast?: boolean;
}) {
  const [showSkipped, setShowSkipped] = React.useState(false);
  const run = connection.lastRun;
  const goodRun = run && run.status === "SUCCEEDED" ? run : null;

  // Expiry row: the date is always "the date you entered".
  let expiry: React.ReactNode = null;
  if (connection.expiryDateEntered) {
    const when = new Date(connection.expiryDateEntered).getTime();
    const date = formatUtcDate(connection.expiryDateEntered);
    const msLeft = nowMs === null ? Number.POSITIVE_INFINITY : when - nowMs;
    if (msLeft < 0) {
      expiry = (
        <p className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          The token expiry date you entered ({date}) has passed. Syncing may fail. Create a new token in IBKR and reconnect.
        </p>
      );
    } else if (msLeft <= 7 * DAY_MS) {
      expiry = (
        <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Your token expires on {date} (the date you entered). Create a new one in IBKR soon, then reconnect.
        </p>
      );
    } else {
      expiry = (
        <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
          <Clock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Your token expires on {date} (the date you entered).
        </p>
      );
    }
  }

  return (
    <div className="space-y-4 rounded-lg border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex items-center gap-3">
        <InitialsChip />
        <div>
          <p className="text-base font-medium">{connection.providerName}</p>
          {connection.accountEnding ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Account ending in {connection.accountEnding}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-1">
        {syncing ? (
          <>
            <p className="flex items-center gap-2 text-base font-medium">
              <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />
              Syncing… this can take up to a minute.
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {connection.lastSuccessAt
                ? `Last synced ${formatUtcDateTime(connection.lastSuccessAt)}.`
                : "Not synced yet."}
            </p>
          </>
        ) : failedLast || !goodRun ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {connection.lastSuccessAt
              ? `Last successful sync: ${formatUtcDateTime(connection.lastSuccessAt)}`
              : "Last successful sync: never"}
          </p>
        ) : (
          <>
            <p className="text-base font-semibold">
              {goodRun.rowsAdded > 0 ? `${plural(goodRun.rowsAdded, "trade", "trades")} added` : "You're up to date"}
            </p>
            {goodRun.rowsAdded === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No new trades since the last sync.</p>
            ) : null}
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Last synced {formatUtcDateTime(connection.lastSuccessAt ?? goodRun.startedAt)}
            </p>
            {goodRun.rowsAlready > 0 || goodRun.rowsSkipped > 0 ? (
              <p className="flex flex-wrap items-center gap-x-1 text-sm text-slate-500 dark:text-slate-400">
                {goodRun.rowsAlready > 0 ? <span>{goodRun.rowsAlready} were already in your portfolio</span> : null}
                {goodRun.rowsAlready > 0 && goodRun.rowsSkipped > 0 ? <span aria-hidden="true">·</span> : null}
                {goodRun.rowsSkipped > 0 ? (
                  <button
                    type="button"
                    aria-expanded={showSkipped}
                    onClick={() => setShowSkipped((v) => !v)}
                    className="inline-flex min-h-11 items-center gap-1 text-blue-600 dark:text-blue-400"
                  >
                    {goodRun.rowsSkipped} skipped
                    <ChevronDown
                      className={`size-4 transition-transform ${showSkipped ? "rotate-180" : ""}`}
                      aria-hidden="true"
                    />
                  </button>
                ) : null}
              </p>
            ) : null}
            {showSkipped ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
                <ul className="list-disc space-y-1 pl-5">
                  {goodRun.skipReasons.map((s) => (
                    <li key={s.reason}>
                      {s.reason} ({s.count})
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  We left these out on purpose instead of guessing. Nothing from them was added.
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>

      <p className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
        <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Token saved. For your safety it&apos;s scrambled and never shown again.
      </p>
      {expiry}
      {run && run.accountCount > 1 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          This report has {run.accountCount} accounts; they all go into your one portfolio.
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Connect / reconnect dialog
// ---------------------------------------------------------------------------

const PROGRESS_STEPS = [
  "Checking your token with Interactive Brokers…",
  "Downloading your trades…",
  "Adding them to your portfolio…",
];

function ConnectDialog({
  reconnectQueryId,
  onClose,
  onConnected,
}: {
  reconnectQueryId: string | null;
  onClose: () => void;
  onConnected: (message: string) => void;
}) {
  const reconnect = reconnectQueryId !== null;
  const [token, setToken] = React.useState("");
  const [queryId, setQueryId] = React.useState(reconnectQueryId ?? "");
  const [expiresOn, setExpiresOn] = React.useState("");
  const [showToken, setShowToken] = React.useState(false);
  const [guideOpen, setGuideOpen] = React.useState(!reconnect);
  const [fieldErrors, setFieldErrors] = React.useState<{ token?: string; queryId?: string; expiresOn?: string }>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);
  const [step, setStep] = React.useState(0);

  // The three progress rows advance on a timer: they are hints, never numbers.
  React.useEffect(() => {
    if (!working) return;
    const a = window.setTimeout(() => setStep(1), 4000);
    const b = window.setTimeout(() => setStep(2), 12000);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [working]);

  function validate(): boolean {
    const errors: typeof fieldErrors = {};
    const t = token.trim();
    if (!t) errors.token = "Paste your Flex token.";
    else if (!/^[A-Za-z0-9-]{10,100}$/.test(t)) errors.token = "That doesn't look like an IBKR Flex token.";
    const q = queryId.trim();
    if (!q) errors.queryId = "Enter your Query ID.";
    else if (!/^\d{1,12}$/.test(q)) errors.queryId = "The Query ID is a number, for example 123456.";
    if (expiresOn) {
      const d = new Date(`${expiresOn}T00:00:00Z`).getTime();
      if (Number.isNaN(d) || d <= Date.now() || d > Date.now() + 396 * DAY_MS) {
        errors.expiresOn = "Pick a date in the future, within the next 13 months.";
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!validate()) return;
    const sent = { token: token.trim(), queryId: queryId.trim(), expiresOn: expiresOn || undefined };
    // Empty the token box right away: it is never kept after submit.
    setToken("");
    setShowToken(false);
    setStep(0);
    setWorking(true);
    const result = await connectBroker(sent);
    setWorking(false);
    if (!result.ok) {
      setFormError(result.error);
      window.setTimeout(() => document.getElementById("broker-token")?.focus(), 0);
      return;
    }
    const s = result.data;
    if (s.status === "SUCCEEDED") {
      onConnected(
        s.rowsAdded > 0
          ? `Interactive Brokers is connected. ${plural(s.rowsAdded, "trade", "trades")} added.`
          : "Interactive Brokers is connected. Your portfolio is up to date.",
      );
    } else {
      // Saved, but the first sync did not finish: the card shows the reason.
      onConnected("Interactive Brokers is connected, but the first sync didn't finish. See the message below.");
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !working) onClose();
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{reconnect ? "Reconnect Interactive Brokers" : "Connect Interactive Brokers"}</DialogTitle>
          <DialogDescription>Read-only. InvestIQ can only download reports, never trade.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-4 space-y-4 md:grid md:grid-cols-2 md:gap-6 md:space-y-0" noValidate>
          <div className="space-y-3">
            {reconnect ? (
              <button
                type="button"
                aria-expanded={guideOpen}
                onClick={() => setGuideOpen((v) => !v)}
                className="flex min-h-11 w-full items-center justify-between rounded-md border border-slate-200 px-3 text-sm font-medium dark:border-slate-800"
              >
                How to get these from IBKR
                <ChevronDown className={`size-4 transition-transform ${guideOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
            ) : (
              <h3 className="text-base font-medium">How to get these from IBKR</h3>
            )}
            {guideOpen ? <Guide /> : null}
          </div>

          <div className="space-y-4">
            {reconnect ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Your Query ID is filled in. You only need the new token.
              </p>
            ) : null}

            {formError ? (
              <Alert variant="destructive">
                <TriangleAlert aria-hidden="true" />
                <AlertDescription>
                  <p>{formError}</p>
                </AlertDescription>
              </Alert>
            ) : null}

            {working ? (
              <div className="space-y-3" role="status" aria-live="polite">
                <ul className="space-y-3 text-sm">
                  {PROGRESS_STEPS.map((label, i) => (
                    <li key={label} className="flex items-center gap-2">
                      {i < step ? (
                        <CircleCheck className="size-4 text-green-600 dark:text-green-400" aria-hidden="true" />
                      ) : i === step ? (
                        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Circle className="size-4 text-slate-300" aria-hidden="true" />
                      )}
                      {label}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-slate-500 dark:text-slate-400">This can take up to a minute.</p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="broker-token">Flex token</Label>
                  <div className="relative">
                    <Input
                      id="broker-token"
                      type={showToken ? "text" : "password"}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      autoFocus
                      className={`h-11 pr-12 ${fieldErrors.token ? "border-red-500" : ""}`}
                      placeholder="Paste your Flex token"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      aria-invalid={Boolean(fieldErrors.token)}
                      aria-describedby="broker-token-help"
                    />
                    <button
                      type="button"
                      title={showToken ? "Hide token" : "Show token"}
                      onClick={() => setShowToken((v) => !v)}
                      className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-md text-slate-500 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {showToken ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                      <span className="sr-only">{showToken ? "Hide token" : "Show token"}</span>
                    </button>
                  </div>
                  <p id="broker-token-help" className="text-xs text-slate-500 dark:text-slate-400">
                    Letters and numbers only.
                  </p>
                  {fieldErrors.token ? <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.token}</p> : null}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="broker-query">Query ID</Label>
                  <Input
                    id="broker-query"
                    inputMode="numeric"
                    autoComplete="off"
                    className={`h-11 ${fieldErrors.queryId ? "border-red-500" : ""}`}
                    placeholder="For example 123456"
                    value={queryId}
                    onChange={(e) => setQueryId(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.queryId)}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    The number shown next to your query under Flex Queries.
                  </p>
                  {fieldErrors.queryId ? <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.queryId}</p> : null}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="broker-expiry">Token expires on (optional)</Label>
                  <Input
                    id="broker-expiry"
                    type="date"
                    className={`h-11 ${fieldErrors.expiresOn ? "border-red-500" : ""}`}
                    value={expiresOn}
                    onChange={(e) => setExpiresOn(e.target.value)}
                    aria-invalid={Boolean(fieldErrors.expiresOn)}
                  />
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    IBKR shows this when you create the token. If you tell us, we&apos;ll remind you before it stops working.
                  </p>
                  {fieldErrors.expiresOn ? <p className="text-xs text-red-600 dark:text-red-400">{fieldErrors.expiresOn}</p> : null}
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Trades in currencies InvestIQ doesn&apos;t support yet (for example EUR) are skipped and listed, never converted.
                </p>
              </>
            )}

            {!working ? (
              <DialogFooter className="sticky bottom-0 border-t border-slate-200 bg-white pt-3 md:col-span-2 dark:border-slate-800 dark:bg-slate-900">
                <Button type="button" variant="outline" size="lg" className="flex-1 sm:flex-none" onClick={onClose}>
                  Cancel
                </Button>
                <Button type="submit" size="lg" className="flex-1 sm:flex-none">
                  Connect
                </Button>
              </DialogFooter>
            ) : null}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Guide() {
  const steps: React.ReactNode[] = [
    "In IBKR's Client Portal, open Performance & Reports, then Flex Queries.",
    <>
      Create an Activity Flex Query. Tick Trades and choose Executions only. Set the format to XML, the period to Last 365
      calendar days and the date format to yyyyMMdd. Tick the fields listed below.
      <span className="mt-2 flex flex-wrap gap-1.5">
        {FLEX_QUERY_FIELDS.map((f) => (
          <span key={f} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800">
            {f}
          </span>
        ))}
      </span>
    </>,
    <>
      Switch on the Flex Web Service and create a token. Choose the <span className="font-medium">longest expiry</span> IBKR
      offers, and do not lock it to an IP address.
    </>,
    "Copy the token and the Query ID into the boxes.",
  ];
  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-3 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium dark:bg-slate-800">
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">{s}</span>
          </li>
        ))}
      </ol>
      <Alert variant="warning">
        <TriangleAlert aria-hidden="true" />
        <AlertDescription>
          <p>Making a new token in IBKR cancels the old one. If you ever do, come back here and reconnect.</p>
        </AlertDescription>
      </Alert>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Practising with a paper-trading account works exactly the same way.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disconnect confirmation
// ---------------------------------------------------------------------------

function DisconnectDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (alreadyDisconnected: boolean) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [working, startWorking] = React.useTransition();

  function confirm() {
    setError(null);
    startWorking(async () => {
      const result = await disconnectBroker();
      if (!result.ok) {
        setError("We couldn't disconnect just now. Nothing changed. Please try again.");
        return;
      }
      onDone(result.data.alreadyDisconnected);
    });
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !working) onClose();
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Disconnect Interactive Brokers?</DialogTitle>
          <DialogDescription>We&apos;ll delete your saved token right now.</DialogDescription>
        </DialogHeader>
        <div className="mt-2 space-y-2 text-sm">
          <p>The trades already synced stay in your portfolio. You can delete them yourself.</p>
          <p>
            InvestIQ can&apos;t cancel the token at IBKR for you. To be sure it can never be used, also delete it in
            IBKR&apos;s Flex Web Service settings.
          </p>
        </div>
        {error ? <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" size="lg" disabled={working} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" size="lg" disabled={working} onClick={confirm}>
            {working ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Disconnecting…
              </>
            ) : (
              "Disconnect"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
