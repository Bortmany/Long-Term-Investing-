// The vendor-neutral seam. A screening supplier answers ONE question per
// stock and only ever with one of four typed results. A second supplier
// (for example Zoya) would add its own adapter file implementing this and a
// new allowed value in config.ts; nothing else changes.

export type VendorVerdict = "COMPLIANT" | "NOT_COMPLIANT";

export type VendorInstrument = { ticker: string; market: string };

export type VendorResult =
  /** The supplier gave a verdict, with the method it named and the date its data is as of. */
  | {
      kind: "verdict";
      verdict: VendorVerdict;
      methodName: string;
      methodVersion: string;
      /** The supplier's own numbers, kept as received. Never computed, never shown. */
      ratios: Record<string, number> | null;
      asOf: Date;
    }
  /** The supplier has no verdict (not found, no data, or a status word we do not map). */
  | { kind: "no_verdict"; unmappedStatus?: boolean }
  /** The call did not work. Never a verdict. */
  | { kind: "unavailable"; reason: "rate_limited" | "auth_failed" | "error" };

export interface ShariaVendor {
  /** Stored in ShariaScreen.source, e.g. "musaffa". */
  readonly id: string;
  /** Printed in the detail sentence, e.g. "Musaffa". */
  readonly displayName: string;
  fetchVerdict(instrument: VendorInstrument): Promise<VendorResult>;
}
