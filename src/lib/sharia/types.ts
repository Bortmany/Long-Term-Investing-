// Sharia screen: the shapes shared by the engine and the screens.
//
// A verdict is BOUGHT from a data supplier, never computed or guessed here.
// "Not screened" is the only fallback and is never stored.

/** Why a stock shows "Not screened". Exactly one of these is ever given. */
export type NotScreenedReason = "not_set_up" | "not_covered" | "no_verdict" | "too_old";

export type ShariaState = "compliant" | "not_compliant" | "not_screened";

/** The supplier's verdict as stored. Anything else is "Not screened". */
export type StoredVerdict = "COMPLIANT" | "NOT_COMPLIANT";

/** One stored row, as the display rule reads it (plain values, no database types). */
export type StoredShariaScreen = {
  verdict: StoredVerdict;
  source: string;
  methodName: string;
  methodVersion: string;
  asOf: Date;
  fetchedAt: Date;
};

/** What the display rule decides. */
export type ShariaDisplay =
  | { state: "compliant" | "not_compliant"; row: StoredShariaScreen }
  | { state: "not_screened"; reason: NotScreenedReason; staleAsOf?: Date };

/** What a screen renders: serializable, with dates already printed as text. */
export type ShariaBadgeData = {
  state: ShariaState;
  /** Only for "not_screened". */
  reason?: NotScreenedReason;
  stockName: string;
  ticker: string;
  /** Market name as people read it ("Muscat"), for the "not covered" reason. */
  exchangeName: string;
  vendorName: string;
  /** Only with a verdict. */
  methodName?: string;
  /** Empty text when the supplier gave no version. */
  methodVersion?: string;
  /** The date the verdict is as of (verdicts), or the old verdict's date (too_old). */
  checkedLabel?: string;
  fetchedLabel?: string;
};

/** The instrument fields the badge needs. */
export type ShariaInstrumentRef = {
  id: string;
  ticker: string;
  name: string;
  market: string;
};
