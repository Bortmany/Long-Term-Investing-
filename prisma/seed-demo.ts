// Demo content, split out of prisma/seed.ts so the end-to-end test setup
// (tests/e2e/global-setup.ts) can give its own test user exactly the same
// sample portfolio the demo login gets.
//
// - seedReferenceData(prisma): the SHARED reference data — instruments,
//   sample prices (source SEED → "sample data" badge) and sample FX rates.
//   Safe on any database, production included; it belongs to no user.
// - seedDemoDataForUser(prisma, userId): the per-user demo content — one
//   portfolio with a year of transactions, a watchlist item, a thesis and a
//   paused alert. Never run for a real person; only for the local demo login
//   and the e2e test user.
// - ensureVerifiedPasswordUser(prisma, …): creates (or refreshes) a local
//   demo/test login with a confirmed email, through Better Auth's own
//   internals so the password is hashed exactly as sign-up would.
//
// Safe to rerun: instruments / FX rates are upserted, and the demo
// portfolio's transactions and seed prices are wiped and recreated.

import type { Prisma, PrismaClient } from "@prisma/client";

type Env = Record<string, string | undefined>;

/**
 * True when the seed must NOT create the demo login or anything hanging off
 * it (portfolio, transactions, watchlist, thesis, alert): production.
 */
export function isProductionSeed(env: Env = process.env): boolean {
  return env.NODE_ENV === "production";
}

const INSTRUMENT_DEFS = [
  { ticker: "AAPL", name: "Apple Inc.", market: "US", currency: "USD", type: "STOCK", sector: "Technology", country: "United States" },
  { ticker: "MSFT", name: "Microsoft Corporation", market: "US", currency: "USD", type: "STOCK", sector: "Technology", country: "United States" },
  { ticker: "KO", name: "The Coca-Cola Company", market: "US", currency: "USD", type: "STOCK", sector: "Consumer Staples", country: "United States" },
  { ticker: "O", name: "Realty Income Corporation", market: "US", currency: "USD", type: "REIT", sector: "Real Estate", country: "United States" },
  { ticker: "BKMB", name: "Bank Muscat", market: "MSX", currency: "OMR", type: "STOCK", sector: "Banks", country: "Oman" },
  { ticker: "2222.SR", name: "Saudi Aramco", market: "TADAWUL", currency: "SAR", type: "STOCK", sector: "Energy", country: "Saudi Arabia" },
  // Watchlist-only: JNJ is watched by the demo user but NOT held (no transactions).
  { ticker: "JNJ", name: "Johnson & Johnson", market: "US", currency: "USD", type: "STOCK", sector: "Healthcare", country: "United States" },
] as const;

const SEED_PRICES: { ticker: string; price: number; currency: "USD" | "OMR" | "SAR"; asOf: string }[] = [
  { ticker: "AAPL", price: 218.4, currency: "USD", asOf: "2026-01-05" },
  { ticker: "AAPL", price: 232.5, currency: "USD", asOf: "2026-07-10" },
  { ticker: "MSFT", price: 512.0, currency: "USD", asOf: "2026-01-05" },
  { ticker: "MSFT", price: 528.0, currency: "USD", asOf: "2026-07-10" },
  { ticker: "KO", price: 70.1, currency: "USD", asOf: "2026-01-05" },
  { ticker: "KO", price: 71.2, currency: "USD", asOf: "2026-07-10" },
  { ticker: "O", price: 58.9, currency: "USD", asOf: "2026-01-05" },
  { ticker: "O", price: 59.8, currency: "USD", asOf: "2026-07-10" },
  { ticker: "BKMB", price: 0.305, currency: "OMR", asOf: "2026-01-05" },
  { ticker: "BKMB", price: 0.312, currency: "OMR", asOf: "2026-07-10" },
  { ticker: "2222.SR", price: 25.1, currency: "SAR", asOf: "2026-01-05" },
  { ticker: "2222.SR", price: 25.6, currency: "SAR", asOf: "2026-07-10" },
  { ticker: "JNJ", price: 168.3, currency: "USD", asOf: "2026-07-10" },
];

const FX_AS_OF = new Date("2026-07-01");
const FX_RATES = [
  { base: "USD", quote: "OMR", rate: 0.385 },
  { base: "SAR", quote: "OMR", rate: 0.1027 },
  { base: "AED", quote: "OMR", rate: 0.1048 },
] as const;

export type ReferenceDataSummary = {
  instruments: Record<string, string>;
  instrumentCount: number;
  priceCount: number;
  fxCount: number;
};

/** Shared, user-less reference data (all labelled sample data). */
export async function seedReferenceData(prisma: PrismaClient): Promise<ReferenceDataSummary> {
  const instruments: Record<string, string> = {};
  for (const def of INSTRUMENT_DEFS) {
    const instrument = await prisma.instrument.upsert({
      where: { ticker_market: { ticker: def.ticker, market: def.market } },
      create: { ...def },
      update: { name: def.name, currency: def.currency, type: def.type, sector: def.sector, country: def.country },
    });
    instruments[def.ticker] = instrument.id;
  }

  // --- Seed prices (source SEED → "sample data" badge) ---
  await prisma.priceCache.deleteMany({
    where: { instrumentId: { in: Object.values(instruments) }, source: "SEED" },
  });
  await prisma.priceCache.createMany({
    data: SEED_PRICES.map((p) => ({
      instrumentId: instruments[p.ticker],
      price: p.price,
      currency: p.currency,
      asOf: new Date(p.asOf),
      source: "SEED" as const,
    })),
  });

  // --- FX rates (1 base = rate quote) ---
  for (const fx of FX_RATES) {
    await prisma.fxRate.upsert({
      where: { base_quote_asOf: { base: fx.base, quote: fx.quote, asOf: FX_AS_OF } },
      create: { ...fx, asOf: FX_AS_OF, source: "SEED" },
      update: { rate: fx.rate, source: "SEED" },
    });
  }

  return {
    instruments,
    instrumentCount: INSTRUMENT_DEFS.length,
    priceCount: SEED_PRICES.length,
    fxCount: FX_RATES.length,
  };
}

export type DemoDataSummary = { portfolioName: string; transactionCount: number };

/**
 * Give ONE user the demo content. Also makes sure the shared reference data
 * exists first (it's idempotent), so callers need only this one function.
 */
export async function seedDemoDataForUser(
  prisma: PrismaClient,
  userId: string,
): Promise<DemoDataSummary> {
  const { instruments } = await seedReferenceData(prisma);

  // --- Portfolio (base currency OMR; cash is derived, never stored) ---
  let portfolio = await prisma.portfolio.findFirst({
    where: { userId, name: "Long-Term Portfolio" },
  });
  if (!portfolio) {
    portfolio = await prisma.portfolio.create({
      data: { userId, name: "Long-Term Portfolio", baseCurrency: "OMR" },
    });
  }
  const portfolioId = portfolio.id;

  // --- Transactions: wipe & recreate a realistic year (Jul 2025 – Jul 2026) ---
  await prisma.transaction.deleteMany({ where: { portfolioId } });

  type TxnSeed = Omit<Prisma.TransactionUncheckedCreateInput, "portfolioId">;
  const txn = (t: TxnSeed): Prisma.TransactionUncheckedCreateInput => ({ ...t, portfolioId });

  const transactions: Prisma.TransactionUncheckedCreateInput[] = [
    // Funding
    txn({ type: "DEPOSIT", amount: 2000, currency: "OMR", fee: 0, tradeDate: new Date("2025-07-15"), note: "Initial funding (OMR)" }),
    txn({ type: "DEPOSIT", amount: 15000, currency: "USD", fee: 0, tradeDate: new Date("2025-07-18"), note: "Initial funding (USD)" }),
    txn({ type: "DEPOSIT", amount: 8000, currency: "SAR", fee: 0, tradeDate: new Date("2025-09-01"), note: "Funding for Tadawul trades" }),

    // Buys
    txn({ type: "BUY", instrumentId: instruments["AAPL"], quantity: 20, pricePerUnit: 210, amount: 4200, currency: "USD", fee: 5, tradeDate: new Date("2025-07-21") }),
    txn({ type: "BUY", instrumentId: instruments["MSFT"], quantity: 8, pricePerUnit: 505, amount: 4040, currency: "USD", fee: 5, tradeDate: new Date("2025-07-21") }),
    txn({ type: "BUY", instrumentId: instruments["KO"], quantity: 60, pricePerUnit: 69, amount: 4140, currency: "USD", fee: 5, tradeDate: new Date("2025-08-05") }),
    txn({ type: "BUY", instrumentId: instruments["O"], quantity: 40, pricePerUnit: 58, amount: 2320, currency: "USD", fee: 5, tradeDate: new Date("2025-08-05") }),
    txn({ type: "BUY", instrumentId: instruments["BKMB"], quantity: 3000, pricePerUnit: 0.3, amount: 900, currency: "OMR", fee: 2, tradeDate: new Date("2025-08-10") }),
    txn({ type: "BUY", instrumentId: instruments["2222.SR"], quantity: 250, pricePerUnit: 24.5, amount: 6125, currency: "SAR", fee: 10, tradeDate: new Date("2025-09-03") }),

    // Dividends — AAPL quarterly
    txn({ type: "DIVIDEND", instrumentId: instruments["AAPL"], amount: 5.0, currency: "USD", fee: 0, tradeDate: new Date("2025-08-14"), note: "AAPL quarterly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["AAPL"], amount: 5.2, currency: "USD", fee: 0, tradeDate: new Date("2025-11-13"), note: "AAPL quarterly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["AAPL"], amount: 5.2, currency: "USD", fee: 0, tradeDate: new Date("2026-02-12"), note: "AAPL quarterly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["AAPL"], amount: 5.6, currency: "USD", fee: 0, tradeDate: new Date("2026-05-14"), note: "AAPL quarterly dividend" }),

    // Dividends — MSFT quarterly
    txn({ type: "DIVIDEND", instrumentId: instruments["MSFT"], amount: 6.64, currency: "USD", fee: 0, tradeDate: new Date("2025-09-11"), note: "MSFT quarterly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["MSFT"], amount: 6.64, currency: "USD", fee: 0, tradeDate: new Date("2025-12-11"), note: "MSFT quarterly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["MSFT"], amount: 6.64, currency: "USD", fee: 0, tradeDate: new Date("2026-03-12"), note: "MSFT quarterly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["MSFT"], amount: 7.2, currency: "USD", fee: 0, tradeDate: new Date("2026-06-11"), note: "MSFT quarterly dividend" }),

    // Dividends — KO quarterly
    txn({ type: "DIVIDEND", instrumentId: instruments["KO"], amount: 30.6, currency: "USD", fee: 0, tradeDate: new Date("2025-10-01"), note: "KO quarterly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["KO"], amount: 30.6, currency: "USD", fee: 0, tradeDate: new Date("2025-12-15"), note: "KO quarterly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["KO"], amount: 30.6, currency: "USD", fee: 0, tradeDate: new Date("2026-04-01"), note: "KO quarterly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["KO"], amount: 31.2, currency: "USD", fee: 0, tradeDate: new Date("2026-07-01"), note: "KO quarterly dividend" }),

    // Dividends — Realty Income monthly (sampled)
    txn({ type: "DIVIDEND", instrumentId: instruments["O"], amount: 10.56, currency: "USD", fee: 0, tradeDate: new Date("2025-09-15"), note: "O monthly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["O"], amount: 10.56, currency: "USD", fee: 0, tradeDate: new Date("2025-11-14"), note: "O monthly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["O"], amount: 10.56, currency: "USD", fee: 0, tradeDate: new Date("2026-01-15"), note: "O monthly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["O"], amount: 10.6, currency: "USD", fee: 0, tradeDate: new Date("2026-03-13"), note: "O monthly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["O"], amount: 7.95, currency: "USD", fee: 0, tradeDate: new Date("2026-06-15"), note: "O monthly dividend (after partial sale)" }),

    // Dividends — Bank Muscat annual
    txn({ type: "DIVIDEND", instrumentId: instruments["BKMB"], amount: 135, currency: "OMR", fee: 0, tradeDate: new Date("2026-03-25"), note: "Bank Muscat annual dividend" }),

    // Dividends — Saudi Aramco quarterly
    txn({ type: "DIVIDEND", instrumentId: instruments["2222.SR"], amount: 87.5, currency: "SAR", fee: 0, tradeDate: new Date("2025-11-10"), note: "Aramco quarterly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["2222.SR"], amount: 87.5, currency: "SAR", fee: 0, tradeDate: new Date("2026-02-10"), note: "Aramco quarterly dividend" }),
    txn({ type: "DIVIDEND", instrumentId: instruments["2222.SR"], amount: 90.0, currency: "SAR", fee: 0, tradeDate: new Date("2026-05-11"), note: "Aramco quarterly dividend" }),

    // Partial sale
    txn({ type: "SELL", instrumentId: instruments["O"], quantity: 10, pricePerUnit: 60, amount: 600, currency: "USD", fee: 3, tradeDate: new Date("2026-04-15"), note: "Trimmed Realty Income position" }),

    // Cash-only rows
    txn({ type: "WITHDRAWAL", amount: 200, currency: "OMR", fee: 0, tradeDate: new Date("2026-05-02"), note: "Cash withdrawal" }),
    txn({ type: "FEE", amount: 15, currency: "USD", fee: 0, tradeDate: new Date("2026-06-30"), note: "Annual account fee" }),
  ];

  await prisma.transaction.createMany({ data: transactions });

  // --- Watchlist: the demo user watches JNJ, which the portfolio does NOT hold ---
  await prisma.watchlistItem.upsert({
    where: { userId_instrumentId: { userId, instrumentId: instruments["JNJ"] } },
    create: {
      userId,
      instrumentId: instruments["JNJ"],
      note: "Dividend aristocrat — waiting for a better entry price.",
    },
    update: { note: "Dividend aristocrat — waiting for a better entry price." },
  });

  // --- Thesis: one ACTIVE thesis on MSFT (Phase 4) ---
  const existingMsftThesis = await prisma.thesis.findFirst({
    where: { userId, instrumentId: instruments["MSFT"] },
  });
  if (!existingMsftThesis) {
    await prisma.thesis.create({
      data: {
        userId,
        instrumentId: instruments["MSFT"],
        statement:
          "Microsoft's cloud business (Azure) keeps growing at a healthy double-digit rate, and its AI products (Copilot, the OpenAI partnership) are turning into real revenue rather than just a story. The balance sheet is strong, the dividend keeps growing every year, and the Office/Windows franchise gives it a wide moat. I'm holding as long as Azure growth stays above 15% and the dividend keeps growing.",
      },
    });
  }

  // --- Alert: one PAUSED sample alert on AAPL (Phase 7) ---
  // Paused on purpose: AAPL's seeded price has source SEED ("sample data"),
  // and alerts honestly never fire on sample data (see the guarantee in
  // src/lib/alerts/evaluate.ts) — so an ACTIVE alert here would just sit
  // silently "not checked" forever. Paused says so plainly instead.
  const existingAlert = await prisma.alert.findFirst({
    where: { userId, instrumentId: instruments["AAPL"], kind: "PRICE_BELOW" },
  });
  if (!existingAlert) {
    await prisma.alert.create({
      data: {
        userId,
        kind: "PRICE_BELOW",
        instrumentId: instruments["AAPL"],
        threshold: 200,
        status: "PAUSED",
        lastOutcome:
          "Paused in the seed data — AAPL's seeded price is sample data, and alerts honestly never fire on sample prices. Set FMP_API_KEY (or enter a manual price) and switch this alert back to Active to have it checked for real.",
      },
    });
  }

  return { portfolioName: portfolio.name, transactionCount: transactions.length };
}

/**
 * Create a local demo/test login with its email already confirmed — or, if
 * it exists, mark it confirmed (and, with `resetPassword`, set its password
 * to the one given). Goes through Better Auth's own internals (same password
 * hashing as sign-up) rather than the public sign-up endpoint, so it sends no
 * email, isn't affected by SIGNUPS_PAUSED, and can't trip the sign-up rate
 * limit. Callers must only ever use it on a local/non-production database.
 */
export async function ensureVerifiedPasswordUser(
  prisma: PrismaClient,
  opts: {
    email: string;
    name: string;
    password: string;
    resetPassword?: boolean;
    // Owner-granted plan (no subscription row), like `npm run plan:set`.
    // Omit to leave the plan alone (new users default to FREE).
    plan?: "FREE" | "PRO";
  },
): Promise<{ id: string; created: boolean }> {
  const { auth } = await import("../src/lib/auth");
  const context = await auth.$context;
  const email = opts.email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { emailVerified: true, ...(opts.plan ? { plan: opts.plan } : {}) },
    });
    if (opts.resetPassword) {
      const hash = await context.password.hash(opts.password);
      await context.internalAdapter.updatePassword(existing.id, hash);
    }
    return { id: existing.id, created: false };
  }

  const hash = await context.password.hash(opts.password);
  const user = await context.internalAdapter.createUser({
    email,
    name: opts.name,
    emailVerified: true,
  });
  await context.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: hash,
  });
  if (opts.plan) {
    await prisma.user.update({ where: { id: user.id }, data: { plan: opts.plan } });
  }
  return { id: user.id, created: true };
}
