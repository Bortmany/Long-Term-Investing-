// Extra sample rows ONLY the phone-layout tests need, added for the e2e test
// login on top of the normal demo portfolio (prisma/seed-demo.ts). They are
// kept out of the shared demo seed on purpose: the owner's demo login and the
// production reference data stay exactly as they were.
//
// Everything here is clearly labelled sample data ("E2E sample" in names and
// notes, prices with source SEED so they show the "sample data" badge) and the
// function is safe to run again: it replaces its own rows and leaves the rest.
//
// What it adds (all on the "Long-Term Portfolio" of the e2e user):
//   - ZQLONG   a holding whose company name is very long
//   - ZQTINY   a holding of 0.00001234 shares (must never read "0")
//   - ZQHUGE   a holding of 12,345,678.9012 shares (card shows 12.35M)
//   - ZQNOPX   a holding with NO stored price ("Unavailable - no price")
//   - one "From broker" synced buy (on ZQLONG), newest in the list
//   - a 500-character thesis (with one stored check), and a closed thesis
//   - one hand-typed FX rate (USD to QAR), so the Settings delete button exists
// The existing 3,000-share holding is Bank Muscat (BKMB) in the normal demo.
//
// NOT seeded (too costly or it would break another spec): a holding that
// cannot be valued for lack of an exchange rate (every supported currency
// already has a shared rate to OMR), a triggered alert, a committee run, a
// weekly review (reviews.spec.ts needs the list empty).

import type { PrismaClient } from "@prisma/client";

export const E2E_SAMPLE_TAG = "E2E sample";
const THESIS_TAG = "[E2E sample]";

const PHONE_INSTRUMENTS = [
  {
    ticker: "ZQLONG",
    name: "Zeta Quantum Long-Horizon Infrastructure and Renewable Utilities Holding Company (E2E sample)",
  },
  { ticker: "ZQTINY", name: "Zeta Tiny Position (E2E sample)" },
  { ticker: "ZQHUGE", name: "Zeta Huge Position (E2E sample)" },
  { ticker: "ZQNOPX", name: "Zeta No Price (E2E sample)" },
] as const;

/** Exactly 500 characters, so the two-line clamp has something to clamp. */
export function longThesisStatement(): string {
  const base =
    `${THESIS_TAG} This sample thesis is deliberately long so the phone card must cut it to two lines. ` +
    "The company owns slow, boring, cash-producing infrastructure. Demand grows with the population, " +
    "prices are linked to inflation, and the debt is long-dated and cheap. I hold it for the steady " +
    "dividend and I will re-read this reason every quarter. I would sell only if the dividend is cut, " +
    "the debt grows faster than earnings, or the regulator changes how prices are set for good. ";
  return (base + "More sample words to fill the space. ".repeat(10)).slice(0, 500);
}

export async function seedPhoneLayoutRows(prisma: PrismaClient, userId: string): Promise<void> {
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId, name: "Long-Term Portfolio" },
  });
  if (!portfolio) throw new Error("E2E phone seed: the demo portfolio is missing.");

  // --- Instruments (market OTHER: never on the public list or the sitemap) ---
  const ids: Record<string, string> = {};
  for (const def of PHONE_INSTRUMENTS) {
    const row = await prisma.instrument.upsert({
      where: { ticker_market: { ticker: def.ticker, market: "OTHER" } },
      create: {
        ticker: def.ticker,
        name: def.name,
        market: "OTHER",
        currency: "OMR",
        type: "STOCK",
        sector: "Utilities",
        country: "Oman",
      },
      update: { name: def.name },
    });
    ids[def.ticker] = row.id;
  }

  // --- Sample prices (source SEED = "sample data"). ZQNOPX gets none. ---
  const priced = ["ZQLONG", "ZQTINY", "ZQHUGE"] as const;
  await prisma.priceCache.deleteMany({
    where: { instrumentId: { in: priced.map((t) => ids[t]) }, source: "SEED" },
  });
  const prices: Record<(typeof priced)[number], string> = {
    ZQLONG: "1",
    ZQTINY: "0.5",
    ZQHUGE: "0.001",
  };
  await prisma.priceCache.createMany({
    data: priced.map((ticker) => ({
      instrumentId: ids[ticker],
      price: prices[ticker],
      currency: "OMR" as const,
      asOf: new Date("2026-07-10"),
      source: "SEED" as const,
    })),
  });

  // --- Transactions (replace our own; every note starts with the tag) ---
  await prisma.transaction.deleteMany({
    where: { portfolioId: portfolio.id, note: { startsWith: E2E_SAMPLE_TAG } },
  });
  const portfolioId = portfolio.id;
  await prisma.transaction.createMany({
    data: [
      {
        portfolioId,
        type: "DEPOSIT",
        amount: "30000",
        currency: "OMR",
        fee: "0",
        tradeDate: new Date("2025-07-16"),
        note: `${E2E_SAMPLE_TAG}: funding so the extra rows keep cash positive`,
      },
      {
        portfolioId,
        type: "BUY",
        instrumentId: ids["ZQTINY"],
        quantity: "0.00001234",
        pricePerUnit: "0.5",
        amount: "0.00000617",
        currency: "OMR",
        fee: "0",
        tradeDate: new Date("2025-08-12"),
        note: `${E2E_SAMPLE_TAG}: tiny quantity`,
      },
      {
        portfolioId,
        type: "BUY",
        instrumentId: ids["ZQHUGE"],
        quantity: "12345678.9012",
        pricePerUnit: "0.001",
        amount: "12345.6789012",
        currency: "OMR",
        fee: "0",
        tradeDate: new Date("2025-08-12"),
        note: `${E2E_SAMPLE_TAG}: huge quantity`,
      },
      {
        portfolioId,
        type: "BUY",
        instrumentId: ids["ZQNOPX"],
        quantity: "10",
        pricePerUnit: "1",
        amount: "10",
        currency: "OMR",
        fee: "0",
        tradeDate: new Date("2025-08-12"),
        note: `${E2E_SAMPLE_TAG}: no stored price`,
      },
      {
        portfolioId,
        type: "BUY",
        instrumentId: ids["ZQLONG"],
        quantity: "100",
        pricePerUnit: "1",
        amount: "100",
        currency: "OMR",
        fee: "0",
        // The newest trade, so it is on the first page of the list.
        tradeDate: new Date("2026-09-20"),
        syncedFrom: "ibkr_flex",
        note: `${E2E_SAMPLE_TAG}: synced trade`,
      },
    ],
  });

  // --- Theses: a 500-character one (with a stored check) and a closed one ---
  const koId = (await prisma.instrument.findFirst({ where: { ticker: "KO", market: "US" } }))?.id;

  let longThesis = await prisma.thesis.findFirst({
    where: { userId, instrumentId: ids["ZQLONG"], statement: { startsWith: THESIS_TAG } },
  });
  if (!longThesis) {
    longThesis = await prisma.thesis.create({
      data: { userId, instrumentId: ids["ZQLONG"], statement: longThesisStatement() },
    });
  }
  const checkCount = await prisma.thesisCheck.count({ where: { thesisId: longThesis.id } });
  if (checkCount === 0) {
    await prisma.thesisCheck.create({
      data: {
        thesisId: longThesis.id,
        integrityScore: 72,
        recommendation: "INTACT",
        evidence: {
          supporting: ["E2E sample evidence: the dividend was paid on time."],
          weakening: [],
          improving: [],
        },
        model: "e2e-sample",
        createdAt: new Date("2026-09-28"),
      },
    });
  }

  if (koId) {
    const closed = await prisma.thesis.findFirst({
      where: { userId, instrumentId: koId, statement: { startsWith: THESIS_TAG } },
    });
    if (!closed) {
      await prisma.thesis.create({
        data: {
          userId,
          instrumentId: koId,
          status: "CLOSED",
          statement: `${THESIS_TAG} Closed sample thesis: people keep drinking it, the dividend grows every year.`,
        },
      });
    }
  }

  // --- One hand-typed FX rate (so Settings has a deletable row) ---
  const fxDate = new Date("2026-07-01");
  await prisma.manualFxRate.upsert({
    where: { userId_base_quote_asOf: { userId, base: "USD", quote: "QAR", asOf: fxDate } },
    create: { userId, base: "USD", quote: "QAR", rate: "3.64", asOf: fxDate },
    update: { rate: "3.64" },
  });
}
