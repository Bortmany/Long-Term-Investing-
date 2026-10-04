// Create or correct the shared stock rows for the PUBLIC LIST
// (src/lib/public-catalogue.ts), and nothing else. Safe to run twice.
//
//   npm run catalogue:sync
//
// It reads DATABASE_URL from .env (or the environment, so it can be pointed at
// the live database). It creates a missing row, and on an existing row fixes
// name, type, sector and country. It NEVER changes a currency (it warns if one
// differs: that stock then stays off the public pages and the sitemap). It
// touches no users, transactions, prices or any other table.

try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the environment
}

import { PrismaClient } from "@prisma/client";
import { PUBLIC_CATALOGUE } from "../src/lib/public-catalogue";

async function main(): Promise<number> {
  const prisma = new PrismaClient();
  try {
    for (const entry of PUBLIC_CATALOGUE) {
      const existing = await prisma.instrument.findUnique({
        where: { ticker_market: { ticker: entry.ticker, market: entry.market } },
        select: { id: true, currency: true },
      });
      if (!existing) {
        await prisma.instrument.create({
          data: {
            ticker: entry.ticker,
            market: entry.market,
            name: entry.name,
            currency: entry.currency,
            type: entry.type,
            sector: entry.sector,
            country: entry.country,
          },
        });
        console.log(`created   ${entry.market}/${entry.ticker}`);
        continue;
      }
      await prisma.instrument.update({
        where: { id: existing.id },
        data: {
          name: entry.name,
          type: entry.type,
          sector: entry.sector,
          country: entry.country,
        },
      });
      if (existing.currency !== entry.currency) {
        console.warn(
          `WARNING   ${entry.market}/${entry.ticker}: stored currency ${existing.currency} differs from the list (${entry.currency}); left alone, so this stock has no public page.`,
        );
      } else {
        console.log(`checked   ${entry.market}/${entry.ticker}`);
      }
    }
    return 0;
  } catch {
    console.error("Could not sync the public list. Nothing else was changed.");
    return 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().then((code) => process.exit(code));
