// Plain, serializable shapes handed from the server pages to the client
// components under src/components/theses/. No Prisma Decimals or non-RSC
// values leak across the boundary (same discipline as src/components/stocks/types.ts).

import type { ThesisStatus } from "@prisma/client";

/** An instrument the user holds or watches — the New Thesis dialog's picker. */
export type InstrumentOption = {
  id: string;
  ticker: string;
  name: string;
};

/** One row of the /theses table (ui-spec §5.1). */
export type ThesisRowData = {
  id: string;
  instrumentTicker: string;
  instrumentName: string;
  statement: string;
  status: ThesisStatus;
  /** integrityScore of the two most recent checks, newest first — used for
   * the score display and the trend arrow. Empty when no checks exist yet. */
  recentScores: number[];
  /** createdAt of the most recent check, or null when none exists yet. */
  lastCheckedAt: Date | null;
};
