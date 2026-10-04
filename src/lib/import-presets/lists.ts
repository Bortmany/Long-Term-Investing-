// The two lists every preset must read AT RUN TIME instead of repeating:
// which currencies and which markets the app really supports.
//
// They come straight from the database enums (the same ones the shared
// transaction schema uses), so when a new currency or market is added to the
// app, every preset picks it up with no edit here or in any preset.
//
// If a shared list file (src/lib/markets.ts) is merged later, this is the ONE
// place to point at it.

import { Currency, Market } from "@prisma/client";

/** Currency codes the app accepts today (read from the real enum each call). */
export function supportedCurrencies(): string[] {
  return Object.values(Currency);
}

/** Market names the app knows today (read from the real enum each call). */
export function realMarketNames(): string[] {
  return Object.values(Market);
}

export function isSupportedCurrency(code: string): boolean {
  return supportedCurrencies().includes(code.trim().toUpperCase());
}

export function isRealMarket(name: string): boolean {
  return realMarketNames().includes(name.trim().toUpperCase());
}
