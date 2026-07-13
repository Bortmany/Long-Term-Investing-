// Server-side loader shared by the dashboard card and the /portfolio section
// so both render the IDENTICAL persisted Health Score. This is a READ of the
// latest stored HEALTH_SCORE row (allowed on render) — it NEVER triggers a new
// generation (that only happens from the generateHealthScore server action on
// an explicit click). The stored output is re-validated against the schema;
// a row that no longer matches is treated as "no analysis yet" rather than
// shown as a fabricated result.
//
// Server-only by convention: imported solely by the dashboard/portfolio server
// components. It touches prisma, so it must never be pulled into a client
// bundle.

import { prisma } from "@/lib/prisma";
import { healthScoreSchema } from "@/lib/ai/schemas";
import type { HealthScorePanelAnalysis } from "@/components/health-score/health-score-panel";

export async function loadPersistedHealthScore(
  portfolioId: string,
): Promise<HealthScorePanelAnalysis | null> {
  const row = await prisma.aiAnalysis.findFirst({
    where: {
      type: "HEALTH_SCORE",
      subjectType: "portfolio",
      subjectId: portfolioId,
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return null;

  const parsed = healthScoreSchema.safeParse(row.output);
  if (!parsed.success) return null;

  return {
    output: parsed.data,
    createdAt: row.createdAt,
    model: row.model,
    dataAsOf: row.dataAsOf,
  };
}
