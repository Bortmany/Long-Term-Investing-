// "Download my data" (engineering-standards.md §6 — data rights wherever
// accounts exist). Pure shaping function: it takes rows the caller already
// fetched from Postgres and turns them into one complete, JSON-safe object.
// No I/O here, so this unit-tests without a database — see
// tests/unit/account-export.test.ts, including THE PRIVACY TEST that proves
// a credential can never leave this file even by accident.
//
// Decimal → number conversions follow docs/CONVENTIONS.md: reuse the shared
// fromPrismaTransaction adapter for transactions; Alert.threshold and
// Notification.priceAtTrigger get the same inline `.toNumber()` treatment
// src/lib/alerts/engine.ts already uses for those two fields (there is no
// shared adapter for them — they aren't part of the portfolio-math domain).

import type {
  AiAnalysisType,
  AlertKind,
  AlertStatus,
  Currency,
  Prisma,
  PriceSource,
  ThesisRecommendation,
  ThesisStatus,
} from "@prisma/client";
import { fromPrismaTransaction, type TxnInput } from "@/lib/portfolio/types";

// ---------------------------------------------------------------------------
// Injectable row shapes — exactly the fields this file reads. Naming every
// field explicitly means a credential can only reach the export if someone
// adds it to one of these types AND to the mapping below — never by a stray
// `...row` spread.
// ---------------------------------------------------------------------------

export type ExportUserRow = {
  name: string;
  email: string;
  createdAt: Date;
};

/**
 * A Better Auth `account` row. `password`, `accessToken`, `refreshToken` and
 * `idToken` are DELIBERATELY NOT part of this type — see the golden rule in
 * docs/CONVENTIONS.md ("never store or leak a secret"). The export can only
 * ever carry the provider name and the two dates.
 */
export type ExportAccountRow = {
  providerId: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * A `session` row. The session `token` itself is NOT part of this type —
 * only the metadata (when, from where) a user would want to see about their
 * own sign-in history.
 */
export type ExportSessionRow = {
  createdAt: Date;
  ipAddress: string | null;
  userAgent: string | null;
};

export type ExportTransactionRow = Prisma.TransactionGetPayload<{
  include: { instrument: { select: { ticker: true } } };
}>;

export type ExportPortfolioRow = {
  id: string;
  name: string;
  baseCurrency: Currency;
  createdAt: Date;
  updatedAt: Date;
  transactions: ExportTransactionRow[];
};

export type ExportWatchlistRow = {
  id: string;
  note: string | null;
  createdAt: Date;
  instrument: { ticker: string };
};

export type ExportThesisCheckRow = {
  id: string;
  integrityScore: number;
  recommendation: ThesisRecommendation;
  evidence: Prisma.JsonValue;
  model: string;
  createdAt: Date;
};

export type ExportThesisRow = {
  id: string;
  statement: string;
  status: ThesisStatus;
  createdAt: Date;
  updatedAt: Date;
  instrument: { ticker: string };
  checks: ExportThesisCheckRow[];
};

export type ExportAiAnalysisRow = {
  type: AiAnalysisType;
  model: string;
  createdAt: Date;
  dataAsOf: Date;
  output: Prisma.JsonValue;
};

export type ExportWeeklyReviewRow = {
  period: string;
  output: Prisma.JsonValue;
  createdAt: Date;
};

export type ExportAlertRow = {
  id: string;
  kind: AlertKind;
  status: AlertStatus;
  threshold: Prisma.Decimal | null;
  intervalDays: number | null;
  lastEvaluatedAt: Date | null;
  lastTriggeredAt: Date | null;
  lastOutcome: string | null;
  createdAt: Date;
  instrument: { ticker: string } | null;
  thesis: { statement: string } | null;
};

export type ExportNotificationRow = {
  id: string;
  title: string;
  body: string;
  priceAtTrigger: Prisma.Decimal | null;
  priceCurrency: Currency | null;
  priceSource: PriceSource | null;
  priceAsOf: Date | null;
  readAt: Date | null;
  createdAt: Date;
};

export type AccountExportRows = {
  user: ExportUserRow;
  accounts: ExportAccountRow[];
  sessions: ExportSessionRow[];
  portfolios: ExportPortfolioRow[];
  watchlist: ExportWatchlistRow[];
  theses: ExportThesisRow[];
  aiAnalyses: ExportAiAnalysisRow[];
  weeklyReviews: ExportWeeklyReviewRow[];
  alerts: ExportAlertRow[];
  notifications: ExportNotificationRow[];
};

// ---------------------------------------------------------------------------
// Output shape (what actually lands in the downloaded file)
// ---------------------------------------------------------------------------

export type ExportedTransaction = TxnInput & {
  id: string;
  instrumentTicker: string | null;
};

export type ExportedPortfolio = {
  id: string;
  name: string;
  baseCurrency: Currency;
  createdAt: Date;
  updatedAt: Date;
  transactions: ExportedTransaction[];
};

export type ExportedAlert = {
  id: string;
  kind: AlertKind;
  status: AlertStatus;
  threshold: number | null;
  intervalDays: number | null;
  lastEvaluatedAt: Date | null;
  lastTriggeredAt: Date | null;
  lastOutcome: string | null;
  createdAt: Date;
  instrumentTicker: string | null;
  thesisStatement: string | null;
};

export type ExportedNotification = {
  id: string;
  title: string;
  body: string;
  priceAtTrigger: number | null;
  priceCurrency: Currency | null;
  priceSource: PriceSource | null;
  priceAsOf: Date | null;
  readAt: Date | null;
  createdAt: Date;
};

export type AccountExport = {
  exportedAt: Date;
  profile: { name: string; email: string; createdAt: Date };
  accounts: ExportAccountRow[];
  sessions: ExportSessionRow[];
  portfolios: ExportedPortfolio[];
  watchlist: ExportWatchlistRow[];
  theses: ExportThesisRow[];
  aiAnalyses: ExportAiAnalysisRow[];
  weeklyReviews: ExportWeeklyReviewRow[];
  alerts: ExportedAlert[];
  notifications: ExportedNotification[];
};

// Runtime whitelists for the two models that can carry a credential
// (`account.password`) or a hijackable secret (`session.token`). These pick
// fields explicitly rather than passing the row through, so even if a
// caller's Prisma query forgets to `select` narrowly and a secret column
// rides along in memory, it still can never reach the exported JSON — see
// THE PRIVACY TEST in tests/unit/account-export.test.ts.
function toExportedAccount(a: ExportAccountRow): ExportAccountRow {
  return { providerId: a.providerId, createdAt: a.createdAt, updatedAt: a.updatedAt };
}

function toExportedSession(s: ExportSessionRow): ExportSessionRow {
  return { createdAt: s.createdAt, ipAddress: s.ipAddress, userAgent: s.userAgent };
}

function toExportedTransaction(t: ExportTransactionRow): ExportedTransaction {
  return {
    ...fromPrismaTransaction(t),
    id: t.id,
    instrumentTicker: t.instrument?.ticker ?? null,
  };
}

function toExportedAlert(a: ExportAlertRow): ExportedAlert {
  return {
    id: a.id,
    kind: a.kind,
    status: a.status,
    threshold: a.threshold === null ? null : a.threshold.toNumber(),
    intervalDays: a.intervalDays,
    lastEvaluatedAt: a.lastEvaluatedAt,
    lastTriggeredAt: a.lastTriggeredAt,
    lastOutcome: a.lastOutcome,
    createdAt: a.createdAt,
    instrumentTicker: a.instrument?.ticker ?? null,
    thesisStatement: a.thesis?.statement ?? null,
  };
}

function toExportedNotification(n: ExportNotificationRow): ExportedNotification {
  return {
    id: n.id,
    title: n.title,
    body: n.body,
    priceAtTrigger: n.priceAtTrigger === null ? null : n.priceAtTrigger.toNumber(),
    priceCurrency: n.priceCurrency,
    priceSource: n.priceSource,
    priceAsOf: n.priceAsOf,
    readAt: n.readAt,
    createdAt: n.createdAt,
  };
}

/**
 * Shape a complete, honest JSON export of one user's data — everything the
 * app stores about them, in one file, nothing more and nothing less. Pure
 * function: the caller (the API route) does the database reads and passes
 * the rows in, so this is fully unit-testable without Postgres.
 */
export function buildAccountExport(rows: AccountExportRows, now: Date = new Date()): AccountExport {
  return {
    exportedAt: now,
    profile: {
      name: rows.user.name,
      email: rows.user.email,
      createdAt: rows.user.createdAt,
    },
    accounts: rows.accounts.map(toExportedAccount),
    sessions: rows.sessions.map(toExportedSession),
    portfolios: rows.portfolios.map((p) => ({
      id: p.id,
      name: p.name,
      baseCurrency: p.baseCurrency,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      transactions: p.transactions.map(toExportedTransaction),
    })),
    watchlist: rows.watchlist,
    theses: rows.theses,
    aiAnalyses: rows.aiAnalyses,
    weeklyReviews: rows.weeklyReviews,
    alerts: rows.alerts.map(toExportedAlert),
    notifications: rows.notifications.map(toExportedNotification),
  };
}
