// Shared broker-connection types. READ-ONLY by design: a provider can check
// credentials and fetch activity, and nothing else. There is deliberately no
// operation here for anything that changes an account, so a feature that does
// could not be added without changing this type.

export type BrokerProviderId = "ibkr_flex";

/** How a failure should be treated by the sync and shown on the card. */
export type FailureKind =
  /** The token is no longer accepted: flip to "needs reconnect". */
  | "reconnect"
  /** Temporary on the broker's side or ours: try again later. */
  | "retry"
  /** The user has to change something (query, settings): connection stays. */
  | "fix";

export type BrokerFailure = {
  ok: false;
  kind: FailureKind;
  /** Our own short code, e.g. "ibkr_1012", "network", "unreadable". */
  code: string;
  /** Plain-English message, safe to show. Never contains a token or a web address. */
  message: string;
  /** True when the failure should be a form error during connect (nothing saved). */
  ibkrCode?: number;
};

/** What the report fetch returns: the raw report text (kept in memory only). */
export type FetchedReport = { ok: true; body: string } | BrokerFailure;

export type ReferenceResult = { ok: true; referenceCode: string } | BrokerFailure;

export type FlexCredentials = { token: string; queryId: string };

/** The read-only description of one broker provider. */
export type BrokerProvider = {
  id: BrokerProviderId;
  displayName: string;
  /** Ask the broker to prepare a report: proves the credentials work. */
  checkCredentials(creds: FlexCredentials): Promise<ReferenceResult>;
  /** Download the prepared report for a reference code. */
  fetchActivity(creds: FlexCredentials, referenceCode: string): Promise<FetchedReport>;
};

// ---------------------------------------------------------------------------
// What the Settings card is allowed to see. NO token field of any kind.
// ---------------------------------------------------------------------------

export type SkipReason = { reason: string; count: number };

export type BrokerRunView = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "RUNNING" | "SUCCEEDED" | "FAILED" | "NEEDS_RECONNECT";
  rowsSeen: number;
  rowsAdded: number;
  rowsAlready: number;
  rowsSkipped: number;
  rowsRejected: number;
  accountCount: number;
  skipReasons: SkipReason[];
  message: string | null;
};

export type BrokerConnectionView = {
  provider: BrokerProviderId;
  providerName: string;
  queryId: string;
  /** Last four characters only. */
  accountEnding: string | null;
  status: "ACTIVE" | "NEEDS_RECONNECT";
  /** The date the user typed (ISO), never fact from the broker. */
  expiryDateEntered: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFailureCode: string | null;
  lastFailureMessage: string | null;
  /** True while a sync is running (state comes from the database). */
  syncing: boolean;
  /** The newest finished-or-running run, if any. */
  lastRun: BrokerRunView | null;
};

/** Which card state to draw (the order of checks never changes). */
export type BrokerCardState =
  | { kind: "dormant"; connection: BrokerConnectionView | null }
  | { kind: "free"; connection: BrokerConnectionView | null; billingEnabled: boolean }
  | { kind: "not_connected" }
  | { kind: "connection"; connection: BrokerConnectionView };

/** Result of connect / sync, safe for the browser. */
export type BrokerSyncSummary = {
  status: "SUCCEEDED" | "FAILED" | "NEEDS_RECONNECT";
  rowsAdded: number;
  rowsAlready: number;
  rowsSkipped: number;
  message: string;
};
