// Demo seed data for InvestIQ AI.
//
// Safe to rerun: instruments / FX rates are upserted, and the demo
// portfolio's transactions and seed prices are wiped and recreated.
// All seeded prices use source SEED so the UI shows the "sample data" badge.

// Load .env when run directly with tsx (prisma db seed already provides env).
try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

import { PrismaClient, type Prisma } from "@prisma/client";

const prisma = new PrismaClient();

const DEMO_EMAIL = "owner@example.com";
// The demo login's password comes from SEED_DEMO_PASSWORD — there is NO
// built-in default on purpose. This stops a guessable demo account (the old
// hardcoded "investiq-demo") from ever ending up on a public site.
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD;

function assertStrongDemoPassword(pw: string | undefined): asserts pw is string {
  if (!pw || pw.length < 12 || pw === "investiq-demo") {
    throw new Error(
      "Set a strong SEED_DEMO_PASSWORD in your .env before seeding the demo " +
        "account — at least 12 characters, and not the old \"investiq-demo\" " +
        "default. This keeps a guessable demo login off any public site.",
    );
  }
}

async function ensureDemoUser(): Promise<string> {
  const existing = await prisma.user.findUnique({
    where: { email: DEMO_EMAIL },
  });
  if (existing) {
    console.log(`Demo user ${DEMO_EMAIL} already exists.`);
    return existing.id;
  }

  // Only reached when the demo user must be created — so require a strong
  // password now (re-running the seed on an existing DB doesn't need it).
  assertStrongDemoPassword(DEMO_PASSWORD);

  // Create via Better Auth's server API so password hashing is correct.
  const { auth } = await import("../src/lib/auth");
  try {
    const result = await auth.api.signUpEmail({
      body: {
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
        name: "Demo Owner",
      },
    });
    console.log(`Created demo user ${DEMO_EMAIL}.`);
    return result.user.id;
  } catch (error) {
    if (process.env.ALLOW_SIGNUPS !== "true") {
      throw new Error(
        "Could not create the demo user because sign-ups are closed (they are " +
          "closed unless ALLOW_SIGNUPS=\"true\"). Seed a fresh database with " +
          "ALLOW_SIGNUPS=\"true\" set first, then remove it to close sign-ups again.",
      );
    }
    throw error;
  }
}

async function main() {
  const userId = await ensureDemoUser();

  // --- Portfolio (base currency OMR; cash is derived, never stored) ---
  let portfolio = await prisma.portfolio.findFirst({
    where: { userId, name: "Long-Term Portfolio" },
  });
  if (!portfolio) {
    portfolio = await prisma.portfolio.create({
      data: { userId, name: "Long-Term Portfolio", baseCurrency: "OMR" },
    });
  }

  // --- Instruments ---
  const instrumentDefs = [
    { ticker: "AAPL", name: "Apple Inc.", market: "US", currency: "USD", type: "STOCK", sector: "Technology", country: "United States" },
    { ticker: "MSFT", name: "Microsoft Corporation", market: "US", currency: "USD", type: "STOCK", sector: "Technology", country: "United States" },
    { ticker: "KO", name: "The Coca-Cola Company", market: "US", currency: "USD", type: "STOCK", sector: "Consumer Staples", country: "United States" },
    { ticker: "O", name: "Realty Income Corporation", market: "US", currency: "USD", type: "REIT", sector: "Real Estate", country: "United States" },
    { ticker: "BKMB", name: "Bank Muscat", market: "MSX", currency: "OMR", type: "STOCK", sector: "Banks", country: "Oman" },
    { ticker: "2222.SR", name: "Saudi Aramco", market: "TADAWUL", currency: "SAR", type: "STOCK", sector: "Energy", country: "Saudi Arabia" },
    // Watchlist-only: JNJ is watched by the demo user but NOT held (no transactions).
    { ticker: "JNJ", name: "Johnson & Johnson", market: "US", currency: "USD", type: "STOCK", sector: "Healthcare", country: "United States" },
  ] as const;

  const instruments: Record<string, string> = {};
  for (const def of instrumentDefs) {
    const instrument = await prisma.instrument.upsert({
      where: { ticker_market: { ticker: def.ticker, market: def.market } },
      create: { ...def },
      update: { name: def.name, currency: def.currency, type: def.type, sector: def.sector, country: def.country },
    });
    instruments[def.ticker] = instrument.id;
  }

  // --- Transactions: wipe & recreate a realistic year (Jul 2025 – Jul 2026) ---
  await prisma.transaction.deleteMany({ where: { portfolioId: portfolio.id } });

  type TxnSeed = Omit<Prisma.TransactionUncheckedCreateInput, "portfolioId">;
  const txn = (t: TxnSeed): Prisma.TransactionUncheckedCreateInput => ({
    ...t,
    portfolioId: portfolio!.id,
  });

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

  // --- Seed prices (source SEED → "sample data" badge) ---
  const seededInstrumentIds = Object.values(instruments);
  await prisma.priceCache.deleteMany({
    where: { instrumentId: { in: seededInstrumentIds }, source: "SEED" },
  });

  const prices: { ticker: string; price: number; currency: "USD" | "OMR" | "SAR"; asOf: string }[] = [
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

  await prisma.priceCache.createMany({
    data: prices.map((p) => ({
      instrumentId: instruments[p.ticker],
      price: p.price,
      currency: p.currency,
      asOf: new Date(p.asOf),
      source: "SEED" as const,
    })),
  });

  // --- FX rates (1 base = rate quote) ---
  const fxAsOf = new Date("2026-07-01");
  const fxRates = [
    { base: "USD", quote: "OMR", rate: 0.385 },
    { base: "SAR", quote: "OMR", rate: 0.1027 },
    { base: "AED", quote: "OMR", rate: 0.1048 },
  ] as const;

  for (const fx of fxRates) {
    await prisma.fxRate.upsert({
      where: {
        base_quote_asOf: { base: fx.base, quote: fx.quote, asOf: fxAsOf },
      },
      create: { ...fx, asOf: fxAsOf, source: "SEED" },
      update: { rate: fx.rate, source: "SEED" },
    });
  }

  // --- Watchlist: the demo user watches JNJ, which the portfolio does NOT hold ---
  await prisma.watchlistItem.upsert({
    where: {
      userId_instrumentId: { userId, instrumentId: instruments["JNJ"] },
    },
    create: {
      userId,
      instrumentId: instruments["JNJ"],
      note: "Dividend aristocrat — waiting for a better entry price.",
    },
    update: {
      note: "Dividend aristocrat — waiting for a better entry price.",
    },
  });

  console.log("Seed complete:");
  // Never print the password — it's the one you set in SEED_DEMO_PASSWORD.
  console.log(`  user:         ${DEMO_EMAIL} (password: the SEED_DEMO_PASSWORD you set)`);
  console.log(`  portfolio:    ${portfolio.name} (base OMR)`);
  console.log(`  instruments:  ${instrumentDefs.length}`);
  console.log(`  transactions: ${transactions.length}`);
  console.log(`  seed prices:  ${prices.length}, fx rates: ${fxRates.length}`);
  console.log(`  watchlist:    1 item (JNJ — watched, not held)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
