// The small broker surfaces outside Settings: the "From broker" tag wording,
// the delete-dialog line, the Portfolio reconnect notice, the import-page
// link decision, and that the Portfolio lookups are scoped to the signed-in user.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  brokerConnection: { findFirst: vi.fn() },
  brokerSyncRun: { findMany: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { fromBrokerDeleteLine, fromBrokerExplanation } from "@/lib/broker/tag-text";
import { loadBrokerPortfolioInfo } from "@/lib/broker/transaction-tags";
import { decideImportBrokerLink } from "@/lib/broker/import-link";
import { BrokerReconnectNotice } from "@/components/portfolio/broker-reconnect-notice";
import { FromBrokerTag } from "@/components/portfolio/from-broker-tag";
import { DeleteTransactionDialog } from "@/components/portfolio/delete-transaction-dialog";
import { TransactionsTable } from "@/components/portfolio/transactions-table";
import type { TransactionRowData } from "@/components/portfolio/types";

describe("From broker wording", () => {
  const day = new Date("2026-10-03T12:00:00Z");
  it("names the sync date while connected", () => {
    expect(fromBrokerExplanation(day, true)).toContain(
      "sync on Oct 3, 2026. If you delete this trade, the next sync adds it back.",
    );
  });
  it("drops the date when the run is pruned", () => {
    expect(fromBrokerExplanation(null, true)).toBe(
      "Brought in by your Interactive Brokers sync. If you delete this trade, the next sync adds it back.",
    );
  });
  it("says deleting won't bring it back after a disconnect", () => {
    expect(fromBrokerExplanation(day, false)).toContain("won't bring it back");
  });
  it("delete line only while connected", () => {
    expect(fromBrokerDeleteLine(true)).toBe(
      "This trade came from your broker sync. The next sync will add it back.",
    );
    expect(fromBrokerDeleteLine(false)).toBeNull();
  });
});

describe("Portfolio reconnect notice", () => {
  it("renders nothing unless it needs reconnecting", () => {
    expect(renderToStaticMarkup(createElement(BrokerReconnectNotice, { show: false }))).toBe("");
  });
  it("links to the Settings card", () => {
    const html = renderToStaticMarkup(createElement(BrokerReconnectNotice, { show: true }));
    expect(html).toContain("Interactive Brokers needs reconnecting, so new trades aren&#x27;t syncing.");
    expect(html).toContain('href="/settings#broker-connection"');
  });
});

describe("loadBrokerPortfolioInfo is scoped to the user", () => {
  beforeEach(() => {
    prismaMock.brokerConnection.findFirst.mockReset();
    prismaMock.brokerSyncRun.findMany.mockReset();
  });
  it("filters the connection and the runs by the user id", async () => {
    prismaMock.brokerConnection.findFirst.mockResolvedValue({ status: "NEEDS_RECONNECT" });
    const when = new Date("2026-10-03T00:00:00Z");
    prismaMock.brokerSyncRun.findMany.mockResolvedValue([{ id: "r1", startedAt: when }]);
    const info = await loadBrokerPortfolioInfo("u1", ["r1"]);
    expect(prismaMock.brokerConnection.findFirst.mock.calls[0][0].where).toEqual({ userId: "u1" });
    expect(prismaMock.brokerSyncRun.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ["r1"] },
      connection: { userId: "u1" },
    });
    expect(info).toEqual({
      connected: true,
      needsReconnect: true,
      runDates: new Map([["r1", when]]),
    });
  });
  it("no connection: not connected, no notice, no run query when no ids", async () => {
    prismaMock.brokerConnection.findFirst.mockResolvedValue(null);
    const info = await loadBrokerPortfolioInfo("u1", []);
    expect(info.connected).toBe(false);
    expect(info.needsReconnect).toBe(false);
    expect(prismaMock.brokerSyncRun.findMany).not.toHaveBeenCalled();
  });
});

describe("import page link decision", () => {
  it("hidden when dormant or already connected", () => {
    expect(decideImportBrokerLink({ enabled: false, pro: true, connected: false })).toBeNull();
    expect(decideImportBrokerLink({ enabled: true, pro: true, connected: true })).toBeNull();
  });
  it("(Pro) for Free, plain for Pro", () => {
    expect(decideImportBrokerLink({ enabled: true, pro: false, connected: false })).toBe("pro");
    expect(decideImportBrokerLink({ enabled: true, pro: true, connected: false })).toBe("available");
  });
});

const baseRow: TransactionRowData = {
  id: "t1",
  type: "BUY",
  instrumentId: "i1",
  ticker: "AAPL",
  quantity: 10,
  pricePerUnit: 205.4,
  amount: 2054,
  currency: "USD",
  fee: 1,
  tradeDate: new Date("2026-09-01T00:00:00Z"),
  note: null,
};

describe("rendering", () => {
  it("the tag shows its label", () => {
    const html = renderToStaticMarkup(
      createElement(FromBrokerTag, { syncedOn: null, connected: true }),
    );
    expect(html).toContain("From broker");
  });

  it("no Source column or tag without synced rows", () => {
    const html = renderToStaticMarkup(
      createElement(TransactionsTable, {
        rows: [baseRow],
        transactionTypes: ["BUY"],
        onAdd: () => {},
        onEdit: () => {},
        onDelete: () => {},
      }),
    );
    expect(html).not.toContain("From broker");
    expect(html).not.toContain(">Source<");
  });

  it("synced rows get the Source column and the tag in table and card views", () => {
    const html = renderToStaticMarkup(
      createElement(TransactionsTable, {
        rows: [{ ...baseRow, syncedFrom: "ibkr_flex" }, { ...baseRow, id: "t2" }],
        transactionTypes: ["BUY"],
        brokerConnected: true,
        onAdd: () => {},
        onEdit: () => {},
        onDelete: () => {},
      }),
    );
    expect(html).toContain(">Source<");
    expect(html.match(/From broker/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("the delete dialog adds the line only for synced rows while connected", () => {
    const render = (row: TransactionRowData, connected: boolean) =>
      renderToStaticMarkup(
        createElement(DeleteTransactionDialog, {
          transaction: row,
          brokerConnected: connected,
          onClose: () => {},
        }),
      );
    const synced = { ...baseRow, syncedFrom: "ibkr_flex" };
    expect(render(synced, true)).toContain("came from your broker sync");
    expect(render(synced, false)).not.toContain("came from your broker sync");
    expect(render(baseRow, true)).not.toContain("came from your broker sync");
  });
});
