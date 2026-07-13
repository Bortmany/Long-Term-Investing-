import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { badgeForPriceSource } from "@/lib/data";
import { badgePropsForValueSource } from "@/components/source-badge";
import { StocksView } from "@/components/stocks/stocks-view";
import type { StockRowData } from "@/components/stocks/types";

export const metadata = { title: "Stocks — InvestIQ AI" };

// /stocks — every instrument worth watching (held OR explicitly tracked) in
// one table (ui-spec §4.1). Everything is loaded server-side and scoped to the
// signed-in user: the "held" set comes from THIS user's transactions and the
// "watched" set from THIS user's watchlist. Golden rule: each quote carries
// its SourceBadge (derived from the stored price's own source), and a row with
// no stored price is passed down as an honest "no price" branch.
export default async function StocksPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  // The user's portfolio (oldest is "the" portfolio — single-portfolio app).
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  const [transactionRows, watchlistRows] = await Promise.all([
    portfolio
      ? prisma.transaction.findMany({
          where: { portfolioId: portfolio.id, instrumentId: { not: null } },
          select: { instrumentId: true },
        })
      : Promise.resolve([]),
    prisma.watchlistItem.findMany({
      where: { userId },
      select: { instrumentId: true },
    }),
  ]);

  const heldIds = new Set(
    transactionRows
      .map((t) => t.instrumentId)
      .filter((id): id is string => id !== null),
  );
  const watchedIds = new Set(watchlistRows.map((w) => w.instrumentId));
  const unionIds = [...new Set([...heldIds, ...watchedIds])];

  if (unionIds.length === 0) {
    return <StocksView rows={[]} />;
  }

  const [instruments, priceRows] = await Promise.all([
    prisma.instrument.findMany({ where: { id: { in: unionIds } } }),
    // Newest first so the first two rows per instrument are the latest closes.
    prisma.priceCache.findMany({
      where: { instrumentId: { in: unionIds } },
      orderBy: { asOf: "desc" },
    }),
  ]);

  // Group price rows per instrument (already newest-first).
  const pricesByInstrument = new Map<string, typeof priceRows>();
  for (const row of priceRows) {
    const list = pricesByInstrument.get(row.instrumentId) ?? [];
    list.push(row);
    pricesByInstrument.set(row.instrumentId, list);
  }

  const rows: StockRowData[] = instruments
    .map((instrument) => {
      const prices = pricesByInstrument.get(instrument.id) ?? [];
      const latest = prices[0];

      // Day change % between the latest close and the most recent close on an
      // EARLIER calendar day — so several intraday cache refreshes on the same
      // day don't get read as a "daily" move. Null when no prior-day close is
      // stored — never a fabricated 0%.
      let changePct: number | null = null;
      if (latest) {
        const latestDay = latest.asOf.toISOString().slice(0, 10);
        const previous = prices.find(
          (p) => p.asOf.toISOString().slice(0, 10) !== latestDay,
        );
        if (previous) {
          const prevClose = previous.price.toNumber();
          if (prevClose > 0) {
            changePct =
              ((latest.price.toNumber() - prevClose) / prevClose) * 100;
          }
        }
      }

      return {
        id: instrument.id,
        ticker: instrument.ticker,
        name: instrument.name,
        quote: latest
          ? {
              ok: true as const,
              price: latest.price.toNumber(),
              currency: latest.currency,
              badge: badgePropsForValueSource({
                kind: badgeForPriceSource(latest.source),
                asOf: latest.asOf,
              }),
            }
          : { ok: false as const },
        changePct,
        held: heldIds.has(instrument.id),
        watched: watchedIds.has(instrument.id),
      };
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  return <StocksView rows={rows} />;
}
