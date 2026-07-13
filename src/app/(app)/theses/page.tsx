import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { thesisCheckSchema } from "@/lib/ai/schemas";
import { ThesesView } from "@/components/theses/theses-view";
import type { InstrumentOption, ThesisRowData } from "@/components/theses/types";

export const metadata = { title: "Theses — InvestIQ AI" };

// /theses — every "why I own this" statement the user has written, and
// whether it still holds up (ui-spec §5.1). Everything is loaded
// server-side, scoped to the signed-in user: theses via THIS user's
// `userId`, and the New Thesis dialog's instrument picker from the SAME
// held-or-watched union query /stocks uses.
export default async function ThesesPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  const [theses, portfolio] = await Promise.all([
    prisma.thesis.findMany({
      where: { userId },
      include: {
        instrument: true,
        checks: { orderBy: { createdAt: "desc" }, take: 2 },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.portfolio.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
  ]);

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

  const instrumentOptions: InstrumentOption[] =
    unionIds.length === 0
      ? []
      : (
          await prisma.instrument.findMany({ where: { id: { in: unionIds } } })
        )
          .map((instrument) => ({
            id: instrument.id,
            ticker: instrument.ticker,
            name: instrument.name,
          }))
          .sort((a, b) => a.ticker.localeCompare(b.ticker));

  const rows: ThesisRowData[] = theses.map((thesis) => {
    // Parse each check's evidence Json defensively (§ contract) — only trust
    // it after schema validation, matching the Stock detail page's re-parse.
    const recentScores = thesis.checks
      .filter((check) => thesisCheckSchema.safeParse(check.evidence).success)
      .map((check) => check.integrityScore);

    return {
      id: thesis.id,
      instrumentTicker: thesis.instrument.ticker,
      instrumentName: thesis.instrument.name,
      statement: thesis.statement,
      status: thesis.status,
      recentScores,
      lastCheckedAt: thesis.checks[0]?.createdAt ?? null,
    };
  });

  return <ThesesView rows={rows} instrumentOptions={instrumentOptions} />;
}
