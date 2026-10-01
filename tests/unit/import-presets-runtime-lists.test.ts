// Broker-file presets must read the supported currencies and markets at run
// time. Here the lists are swapped for made-up ones to prove that adding a
// currency or a market to the app needs no change in any preset.

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/import-presets/lists", () => {
  const currencies = ["USD", "EUR"];
  const markets = ["US", "DFM"];
  return {
    supportedCurrencies: () => currencies,
    realMarketNames: () => markets,
    isSupportedCurrency: (c: string) => currencies.includes(c.trim().toUpperCase()),
    isRealMarket: (m: string) => markets.includes(m.trim().toUpperCase()),
  };
});

import { readBrokerFile, translateExchange } from "@/lib/import-presets";

const HEAD = "Action,Time,Ticker,No. of shares,Price / share,Currency (Price / share),Total,Currency (Total),ID";

describe("currencies and markets come from the app's lists, not from the presets", () => {
  it("a currency added to the list is accepted with no preset change", () => {
    const r = readBrokerFile(
      "trading212",
      [HEAD, "Market buy,2026-01-12 15:31:07,SAP,3,150.00,EUR,450.00,EUR,T1"].join("\n"),
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.ready).toHaveLength(1);
    expect(r.ready[0].mapped.currency).toBe("EUR");
  });

  it("a currency that is not in the list is still skipped", () => {
    const r = readBrokerFile(
      "trading212",
      [HEAD, "Market buy,2026-01-12 15:31:07,VOD,3,150.00,GBX,450.00,EUR,T1"].join("\n"),
    );
    if (!r.ok) throw new Error(r.message);
    expect(r.ready).toHaveLength(0);
    expect(r.skipped[0].reason).toBe("Currency GBX is not supported yet");
  });

  it("an exchange word only translates to a market the app has", () => {
    expect(translateExchange("XDFM")).toBe("DFM");
    expect(translateExchange("XMUS")).toBeUndefined();
    expect(translateExchange("XSAU")).toBeUndefined();
  });

  it("the template only accepts market names from the app's list", () => {
    const head = "Date,Ticker,Market,Type,Quantity,Price,Amount,Fee,Currency,Note";
    const r = readBrokerFile("template", [head, "2026-01-06,AAA,DFM,Buy,1,5.00,,,USD,", "2026-01-06,BBB,MSX,Buy,1,5.00,,,USD,"].join("\n"));
    if (!r.ok) throw new Error(r.message);
    expect(r.ready).toHaveLength(1);
    expect(r.cannotRead).toHaveLength(1);
  });
});
