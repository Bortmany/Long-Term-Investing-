// The refresh job: asks the supplier about stocks and stores what it says.
// Used by the daily cron route (all switched-on users) and by the background
// fetch right after someone switches the badge on (one user, at most 25).
//
// Rules (sharia-screen.md, S4):
//  - only covered exchanges are asked about (the rest are counted, not sent);
//  - no stored row first, then oldest fetch first; at most `maxInstruments`;
//  - at most 5 calls at once; the adapter times each out; no retry;
//  - a verdict replaces the stored row; "no verdict" (or an unmapped status
//    word) DELETES it, so the badge falls back to "Not screened" at once;
//  - a failed call leaves the stored row alone (the 100-day rule guards it);
//  - "rate limited" or "auth failed" stops the run, keeping what is stored;
//  - the summary holds COUNTS ONLY.

import { logger } from "@/lib/logger";
import { MAX_AGE_DAYS, ageInDays } from "./display";
import { isCoveredMarket } from "./coverage";
import { prismaShariaStore, type RefreshCandidate, type ShariaStore } from "./store";
import type { ShariaVendor } from "./vendor";

export const DAILY_MAX_INSTRUMENTS = 500;
export const BACKFILL_MAX_INSTRUMENTS = 25;
const MAX_PARALLEL = 5;

export type RefreshScope = "all-users" | { userId: string };

export type RefreshSummary = {
  status: "ok" | "dormant" | "skipped";
  /** Plain reason when not "ok". */
  message?: string;
  screened: number;
  removed: number;
  keptOnError: number;
  skippedUncovered: number;
  unmappedStatuses: number;
  stoppedEarly: boolean;
  capReached: boolean;
};

export type RefreshDeps = {
  /** The active supplier, or null when screening is not set up. */
  vendor: ShariaVendor | null;
  store?: ShariaStore;
  now?: () => Date;
};

function emptySummary(status: RefreshSummary["status"], message?: string): RefreshSummary {
  return {
    status,
    ...(message ? { message } : {}),
    screened: 0,
    removed: 0,
    keptOnError: 0,
    skippedUncovered: 0,
    unmappedStatuses: 0,
    stoppedEarly: false,
    capReached: false,
  };
}

/** No usable verdict yet: no row, or one older than the display cutoff. */
function lacksUsableVerdict(candidate: RefreshCandidate, now: Date): boolean {
  if (!candidate.existing) return true;
  return ageInDays(candidate.existing.asOf, now) > MAX_AGE_DAYS;
}

/** Order: no stored row first, then oldest fetch first. */
export function orderCandidates(candidates: RefreshCandidate[]): RefreshCandidate[] {
  return [...candidates].sort((a, b) => {
    if (!a.existing && b.existing) return -1;
    if (a.existing && !b.existing) return 1;
    if (a.existing && b.existing) return a.existing.fetchedAt.getTime() - b.existing.fetchedAt.getTime();
    return 0;
  });
}

/**
 * How many of one person's own stocks still lack a usable verdict (covered
 * exchanges only). The switch-on action asks this before starting a fetch.
 */
export async function countBackfillCandidates(
  userId: string,
  deps: { source: string; store?: ShariaStore; now?: () => Date },
): Promise<number> {
  const store = deps.store ?? prismaShariaStore;
  const now = (deps.now ?? (() => new Date()))();
  const all = await store.listCandidates({ userId }, deps.source);
  return Math.min(
    BACKFILL_MAX_INSTRUMENTS,
    all.filter((c) => isCoveredMarket(c.market) && lacksUsableVerdict(c, now)).length,
  );
}

export async function refreshShariaScreens(
  options: { scope: RefreshScope; maxInstruments: number; onlyWithoutUsableVerdict?: boolean },
  deps: RefreshDeps,
): Promise<RefreshSummary> {
  const { vendor } = deps;
  if (!vendor) return emptySummary("dormant", "Sharia screening is not set up (no supplier key).");
  const store = deps.store ?? prismaShariaStore;
  const now = (deps.now ?? (() => new Date()))();

  if (options.scope === "all-users" && !(await store.anyoneEnabled())) {
    return emptySummary("skipped", "Nobody has turned the screen on.");
  }

  const summary = emptySummary("ok");
  let candidates = await store.listCandidates(options.scope, vendor.id);

  const covered = candidates.filter((c) => isCoveredMarket(c.market));
  summary.skippedUncovered = candidates.length - covered.length;
  candidates = covered;
  if (options.onlyWithoutUsableVerdict) {
    candidates = candidates.filter((c) => lacksUsableVerdict(c, now));
  }

  const ordered = orderCandidates(candidates);
  summary.capReached = ordered.length > options.maxInstruments;
  const queue = ordered.slice(0, options.maxInstruments);

  let next = 0;
  let stop = false;

  async function worker(): Promise<void> {
    while (!stop) {
      const index = next++;
      if (index >= queue.length) return;
      const candidate = queue[index];
      let result;
      try {
        result = await vendor!.fetchVerdict({ ticker: candidate.ticker, market: candidate.market });
      } catch {
        result = { kind: "unavailable" as const, reason: "error" as const };
      }

      if (result.kind === "unavailable") {
        summary.keptOnError += 1;
        if (result.reason === "rate_limited" || result.reason === "auth_failed") {
          stop = true;
          summary.stoppedEarly = true;
          logger.warn("Sharia refresh stopped early", { reason: result.reason });
        }
        continue;
      }
      try {
        if (result.kind === "verdict") {
          await store.save(candidate.id, vendor!.id, result, now);
          summary.screened += 1;
        } else {
          await store.remove(candidate.id, vendor!.id);
          summary.removed += 1;
          if (result.unmappedStatus) summary.unmappedStatuses += 1;
        }
      } catch {
        // A database problem on one stock must not end the run or leak detail.
        summary.keptOnError += 1;
        logger.error("Sharia refresh could not store a result");
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(MAX_PARALLEL, queue.length) }, () => worker()));
  return summary;
}
