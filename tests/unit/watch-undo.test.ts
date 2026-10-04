// Un-watch Undo and Track a Stock on a ticker that already exists (Step 7,
// Chunk B). Undo has no endpoint of its own: it calls the SAME addToWatchlist
// server action as the star, so the 30-a-minute watchlist-write limit applies.
// These tests run the real server actions against a fake database.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  userId: "user-a" as string | null,
  // watchlist rows as "userId:instrumentId"
  watchlist: new Set<string>(),
  duplicateTicker: false,
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/user-portfolio", () => ({
  getSessionUserId: async () => state.userId,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    instrument: {
      count: async () => 1,
      create: async (args: { data: { ticker: string } }) => {
        if (state.duplicateTicker) {
          throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "test",
          });
        }
        return { id: "new-id", ticker: args.data.ticker };
      },
      // The stored row carries a name typed by SOMEONE ELSE; it must never come back.
      findUnique: async () => ({ id: "existing-id", name: "Typed By Another User" }),
    },
    watchlistItem: {
      count: async (args: { where: { userId: string; instrumentId: string } }) =>
        state.watchlist.has(`${args.where.userId}:${args.where.instrumentId}`) ? 1 : 0,
      upsert: async (args: { create: { userId: string; instrumentId: string } }) => {
        state.watchlist.add(`${args.create.userId}:${args.create.instrumentId}`);
        return {};
      },
      deleteMany: async (args: { where: { userId: string; instrumentId: string } }) => {
        state.watchlist.delete(`${args.where.userId}:${args.where.instrumentId}`);
        return { count: 1 };
      },
    },
  },
}));

import { createInstrument } from "@/app/actions/instruments";
import { addToWatchlist, removeFromWatchlist } from "@/app/actions/stocks";
import { resetRateLimit, userKey, WRITE_ACTION_RATE_LIMIT } from "@/lib/rate-limit";
import {
  backOnWatchlistMessage,
  removedToastMessage,
  TOO_MANY_REQUESTS_TOAST,
  trackedToastMessage,
  undoFailureMessage,
  watchFailureMessage,
} from "@/lib/stocks/watch-messages";

beforeEach(() => {
  state.userId = "user-a";
  state.watchlist.clear();
  state.duplicateTicker = false;
  for (const id of ["user-a", "user-b"]) {
    resetRateLimit(userKey("watchlist-write", id));
    resetRateLimit(userKey("instrument-write", id));
  }
});

describe("Undo goes through the rate-limited watchlist action", () => {
  it("the toast words are the plain ones from the design", () => {
    expect(removedToastMessage("JNJ")).toBe("JNJ removed from your watchlist");
    expect(backOnWatchlistMessage("JNJ")).toBe("JNJ is back on your watchlist");
    expect(undoFailureMessage("JNJ", "That stock could not be found.")).toBe(
      "Couldn't put JNJ back. Try Track a Stock to add it again.",
    );
  });

  it("un-watch then Undo puts the stock back for that user", async () => {
    await addToWatchlist("jnj-id");
    const removed = await removeFromWatchlist("jnj-id");
    expect(removed.ok).toBe(true);
    expect(state.watchlist.has("user-a:jnj-id")).toBe(false);

    const undone = await addToWatchlist("jnj-id");
    expect(undone).toMatchObject({ ok: true, data: { id: "jnj-id", alreadyWatching: false } });
    expect(state.watchlist.has("user-a:jnj-id")).toBe(true);
  });

  it("Undo shares the 30-a-minute watchlist-write bucket: when it is used up, Undo is refused with the 'Too many requests' sentence", async () => {
    for (let i = 0; i < WRITE_ACTION_RATE_LIMIT.limit - 1; i += 1) {
      expect((await addToWatchlist("jnj-id")).ok).toBe(true);
    }
    // The un-watch is the 30th write; the Undo right after is the 31st.
    expect((await removeFromWatchlist("jnj-id")).ok).toBe(true);
    const undo = await addToWatchlist("jnj-id");
    expect(undo.ok).toBe(false);
    if (!undo.ok) {
      expect(undo.error).toContain("Too many requests");
      // What the toast shows for a refused Undo, and for a refused un-watch.
      expect(undoFailureMessage("JNJ", undo.error)).toBe(TOO_MANY_REQUESTS_TOAST);
      expect(watchFailureMessage(undo.error)).toBe(TOO_MANY_REQUESTS_TOAST);
    }
    // Nothing was put back by the refused Undo.
    expect(state.watchlist.has("user-a:jnj-id")).toBe(false);
  });

  it("one user's busy bucket never blocks another user, and one user's writes never touch another's list", async () => {
    await addToWatchlist("jnj-id"); // user-a watches
    state.userId = "user-b";
    await addToWatchlist("jnj-id");
    await removeFromWatchlist("jnj-id"); // user-b un-watches
    expect(state.watchlist.has("user-b:jnj-id")).toBe(false);
    expect(state.watchlist.has("user-a:jnj-id")).toBe(true);
  });

  it("signed out: refused, nothing changes", async () => {
    state.userId = null;
    expect((await addToWatchlist("jnj-id")).ok).toBe(false);
    expect((await removeFromWatchlist("jnj-id")).ok).toBe(false);
    expect(state.watchlist.size).toBe(0);
  });
});

describe("Track a Stock on a ticker that already exists", () => {
  const typed = {
    ticker: "jnj",
    name: "Whatever I typed",
    market: "US",
    currency: "USD",
    type: "STOCK",
  } as const;

  it("a new ticker is created and flagged as new", async () => {
    const result = await createInstrument(typed);
    expect(result).toEqual({
      ok: true,
      data: { id: "new-id", ticker: "JNJ", alreadyExisted: false },
    });
  });

  it("a duplicate ticker + market succeeds with the existing id, flagged alreadyExisted, and echoes no stored name", async () => {
    state.duplicateTicker = true;
    const result = await createInstrument(typed);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual({ id: "existing-id", ticker: "JNJ", alreadyExisted: true });
      expect(JSON.stringify(result)).not.toContain("Typed By Another User");
    }
  });

  it("then the watchlist action adds it for this user; a second time says it was already there", async () => {
    state.duplicateTicker = true;
    const created = await createInstrument(typed);
    if (!created.ok) throw new Error("expected success");

    const first = await addToWatchlist(created.data.id);
    expect(first).toMatchObject({ ok: true, data: { alreadyWatching: false } });
    if (first.ok) {
      expect(trackedToastMessage(created.data.ticker, first.data.alreadyWatching)).toBe(
        "JNJ added to your watchlist.",
      );
    }

    const second = await addToWatchlist(created.data.id);
    expect(second).toMatchObject({ ok: true, data: { alreadyWatching: true } });
    if (second.ok) {
      expect(trackedToastMessage(created.data.ticker, second.data.alreadyWatching)).toBe(
        "JNJ is already on your watchlist.",
      );
    }
  });

  it("the Track a Stock add is also limited by the watchlist-write bucket", async () => {
    for (let i = 0; i < WRITE_ACTION_RATE_LIMIT.limit; i += 1) await addToWatchlist("jnj-id");
    const refused = await addToWatchlist("jnj-id");
    expect(refused.ok).toBe(false);
  });
});

describe("the old 'already tracked' sentence is gone from the app", () => {
  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return sourceFiles(full);
      return /\.(ts|tsx)$/.test(name) ? [full] : [];
    });
  }

  it("no file under src/ says 'already tracked'", () => {
    const offenders = sourceFiles(join(process.cwd(), "src")).filter((file) =>
      /already tracked/i.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
