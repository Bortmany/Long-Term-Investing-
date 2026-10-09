// Pretend screening supplier + pretend store for tests. No network, no
// database, no real key. Scripted by ticker.

import type { RefreshCandidate, ShariaStore } from "@/lib/sharia/store";
import type { ShariaVendor, VendorInstrument, VendorResult } from "@/lib/sharia/vendor";

export const FAKE_AS_OF = new Date("2026-09-29T00:00:00Z");

export function verdictResult(verdict: "COMPLIANT" | "NOT_COMPLIANT" = "COMPLIANT"): VendorResult {
  return {
    kind: "verdict",
    verdict,
    methodName: "Fake method",
    methodVersion: "v1",
    ratios: { debt: 0.1 },
    asOf: FAKE_AS_OF,
  };
}

export function fakeVendor(script: Record<string, VendorResult>): ShariaVendor & { calls: string[] } {
  const calls: string[] = [];
  return {
    id: "musaffa",
    displayName: "Musaffa",
    calls,
    async fetchVerdict(instrument: VendorInstrument) {
      calls.push(instrument.ticker);
      return script[instrument.ticker] ?? { kind: "no_verdict" };
    },
  };
}

export type FakeStore = ShariaStore & {
  rows: Map<string, { verdict: string; fetchedAt: Date }>;
  enabledUsers: number;
};

export function fakeStore(
  candidates: RefreshCandidate[],
  options: { enabledUsers?: number; rows?: [string, { verdict: string; fetchedAt: Date }][] } = {},
): FakeStore {
  const rows = new Map(options.rows ?? []);
  const store: FakeStore = {
    rows,
    enabledUsers: options.enabledUsers ?? 1,
    async anyoneEnabled() {
      return store.enabledUsers > 0;
    },
    async listCandidates() {
      return candidates;
    },
    async save(instrumentId, _source, result, fetchedAt) {
      rows.set(instrumentId, { verdict: result.verdict, fetchedAt });
    },
    async remove(instrumentId) {
      rows.delete(instrumentId);
    },
  };
  return store;
}
