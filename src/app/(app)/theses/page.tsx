import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { EmptyState } from "@/components/empty-state";
import { NewThesisDialog } from "@/components/theses/new-thesis-dialog";
import { ThesesList, type ThesisListRow } from "@/components/theses/theses-list";
import { deriveTrendArrow } from "@/lib/theses/checks";

export const metadata = { title: "Theses — InvestIQ AI" };

// /theses — the list of "why I own this" statements and whether they still
// hold up (ui-spec §5.1). Everything is loaded server-side, scoped to the
// signed-in user. The Instrument picker offered by "New Thesis" is the same
// held-or-watched set /stocks populates.
export default async function ThesesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  const [portfolio, watchlistRows, theses] = await Promise.all([
    prisma.portfolio.findFirst({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.watchlistItem.findMany({ where: { userId } }),
    prisma.thesis.findMany({
      where: { userId },
      include: {
        instrument: true,
        // Only need the two most recent checks per thesis: one for the
        // "Latest Integrity Score" cell, the pair for the trend arrow.
        checks: { orderBy: { createdAt: "desc" }, take: 2 },
      },
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
  const pickableIds = [...new Set([...heldIds, ...watchedIds])];
  const pickableInstruments = pickableIds.length
    ? await prisma.instrument.findMany({
        where: { id: { in: pickableIds } },
        orderBy: { ticker: "asc" },
      })
    : [];
  const instrumentOptions = pickableInstruments.map((instrument) => ({
    id: instrument.id,
    ticker: instrument.ticker,
    name: instrument.name,
  }));

  if (theses.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        heading="Theses"
        sentence="Track why you own a position and let AI check if it still holds up."
        action={<NewThesisDialog instruments={instrumentOptions} />}
      />
    );
  }

  const rows: ThesisListRow[] = theses.map((thesis) => {
    const [latest, previous] = thesis.checks;
    return {
      id: thesis.id,
      ticker: thesis.instrument.ticker,
      name: thesis.instrument.name,
      statement: thesis.statement,
      status: thesis.status,
      latestScore: latest?.integrityScore ?? null,
      trend: latest ? deriveTrendArrow(latest.integrityScore, previous?.integrityScore) : null,
      lastCheckedAt: latest?.createdAt ?? null,
    };
  });

  return (
    <>
      <div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Theses</h1>
        <NewThesisDialog instruments={instrumentOptions} />
      </div>
      <ThesesList rows={rows} />
    </>
  );
}
