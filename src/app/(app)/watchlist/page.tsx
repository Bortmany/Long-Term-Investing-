import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Eye } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getQuote } from "@/lib/data";
import { badgePropsForValueSource } from "@/components/source-badge";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { WatchlistView } from "@/components/watchlist/watchlist-view";
import type {
  AlertInstrumentOption,
  AlertRowData,
  AlertThesisOption,
  WatchlistInstrumentRow,
} from "@/components/watchlist/types";

export const metadata = { title: "Watchlist — InvestIQ AI" };

// /watchlist — every watched-or-held stock in one table, plus the Alerts
// card (BUILD-PLAN.md Phase 7). Reuses the same held/watched instrument set
// and quote-badging pattern as /stocks (src/app/(app)/stocks/page.tsx),
// WatchToggleButton unchanged. Everything is loaded server-side, scoped to
// the signed-in user.
export default async function WatchlistPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  const [portfolio, watchlistRows, alerts, activeTheses] = await Promise.all([
    prisma.portfolio.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.watchlistItem.findMany({ where: { userId } }),
    prisma.alert.findMany({
      where: { userId },
      include: { instrument: true, thesis: { include: { instrument: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.thesis.findMany({
      where: { userId, status: "ACTIVE" },
      include: { instrument: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const heldIds = new Set<string>();
  if (portfolio) {
    const heldTransactions = await prisma.transaction.findMany({
      where: { portfolioId: portfolio.id, instrumentId: { not: null } },
      select: { instrumentId: true },
    });
    for (const t of heldTransactions) {
      if (t.instrumentId) heldIds.add(t.instrumentId);
    }
  }
  const watchedIds = new Set(watchlistRows.map((w) => w.instrumentId));
  const instrumentIds = [...new Set([...heldIds, ...watchedIds])];

  // Zero held + zero watched: the whole page is one empty state (same
  // pattern as /stocks) pointing at Stocks, since there is nothing yet to
  // set a price alert on. (The Alerts card below has its own "New Alert"
  // empty state for the narrower "some instruments, zero alerts yet" case.)
  if (instrumentIds.length === 0) {
    return (
      <EmptyState
        icon={Eye}
        heading="Watchlist"
        sentence="Add a holding or track a stock, then set an alert to hear when something changes."
        action={
          <Button asChild>
            <Link href="/stocks">Go to Stocks</Link>
          </Button>
        }
      />
    );
  }

  const instruments = await prisma.instrument.findMany({
    where: { id: { in: instrumentIds } },
    orderBy: { ticker: "asc" },
  });

  const activeAlertCountByInstrument = new Map<string, number>();
  for (const alert of alerts) {
    if (alert.instrumentId && alert.status === "ACTIVE") {
      activeAlertCountByInstrument.set(
        alert.instrumentId,
        (activeAlertCountByInstrument.get(alert.instrumentId) ?? 0) + 1,
      );
    }
  }

  const rows: WatchlistInstrumentRow[] = await Promise.all(
    instruments.map(async (instrument) => {
      const ref = {
        id: instrument.id,
        ticker: instrument.ticker,
        market: instrument.market,
        currency: instrument.currency,
      };
      const quoteResult = await getQuote(ref);
      const quote: WatchlistInstrumentRow["quote"] = quoteResult.ok
        ? {
            ok: true,
            value: quoteResult.data.price,
            currency: quoteResult.data.currency,
            badge: badgePropsForValueSource({
              kind: quoteResult.data.source,
              asOf: quoteResult.data.asOf,
            }),
          }
        : { ok: false };

      return {
        instrumentId: instrument.id,
        ticker: instrument.ticker,
        name: instrument.name,
        market: instrument.market,
        quote,
        held: heldIds.has(instrument.id),
        watched: watchedIds.has(instrument.id),
        activeAlertCount: activeAlertCountByInstrument.get(instrument.id) ?? 0,
      };
    }),
  );

  const alertRows: AlertRowData[] = alerts.map((alert) => ({
    id: alert.id,
    kind: alert.kind,
    status: alert.status,
    instrumentId: alert.instrumentId,
    instrumentTicker: alert.instrument?.ticker ?? null,
    instrumentCurrency: alert.instrument?.currency ?? null,
    thesisId: alert.thesisId,
    thesisTicker: alert.thesis?.instrument.ticker ?? null,
    threshold: alert.threshold === null ? null : alert.threshold.toNumber(),
    intervalDays: alert.intervalDays,
    lastEvaluatedAt: alert.lastEvaluatedAt,
    lastOutcome: alert.lastOutcome,
  }));

  const instrumentOptions: AlertInstrumentOption[] = instruments.map((instrument) => ({
    id: instrument.id,
    ticker: instrument.ticker,
    name: instrument.name,
    currency: instrument.currency,
  }));
  const thesisOptions: AlertThesisOption[] = activeTheses.map((thesis) => ({
    id: thesis.id,
    ticker: thesis.instrument.ticker,
  }));

  return (
    <>
      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Watchlist</h1>
      </div>
      <WatchlistView
        instruments={rows}
        alerts={alertRows}
        instrumentOptions={instrumentOptions}
        thesisOptions={thesisOptions}
      />
    </>
  );
}
