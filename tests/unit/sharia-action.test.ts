// The Settings switch logic with injected fakes.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { applyShariaPreference } from "@/lib/sharia/preference";
import { actionError, actionOk } from "@/lib/action-result";
import { resetRateLimit, userKey } from "@/lib/rate-limit";
import { fakeVendor } from "../support/fake-sharia-vendor";

const proOk = async () => actionOk(null);
const proNo = async () =>
  actionError("The Sharia screen is part of Pro, which is coming soon. Everything you've already saved is still here.", {
    code: "PRO_REQUIRED",
  });

function fakes(over: Record<string, unknown> = {}) {
  const save = vi.fn<(userId: string, enabled: boolean) => Promise<void>>(async () => {});
  const scheduled: Array<() => Promise<void>> = [];
  const run = vi.fn(async () => ({}));
  return {
    save,
    scheduled,
    run,
    deps: {
      savePreference: save,
      requireProFn: proOk,
      vendor: fakeVendor({}),
      countCandidates: async () => 3,
      schedule: (work: () => Promise<void>) => void scheduled.push(work),
      runRefresh: run,
      ...over,
    },
  };
}

beforeEach(() => {
  for (const id of ["u1", "u2"]) {
    resetRateLimit(userKey("settings-write", id));
    resetRateLimit(userKey("sharia-refresh", id));
  }
});

describe("applyShariaPreference", () => {
  it("rejects a non-boolean value", async () => {
    const { deps, save } = fakes();
    for (const bad of ["true", 1, null, undefined, {}]) {
      const result = await applyShariaPreference("u1", bad, deps);
      expect(result.ok).toBe(false);
    }
    expect(save).not.toHaveBeenCalled();
  });

  it("Free turning ON is refused with the 'part of Pro' sentence and nothing is saved", async () => {
    const { deps, save } = fakes({ requireProFn: proNo });
    const result = await applyShariaPreference("u1", true, deps);
    expect(result).toMatchObject({ ok: false, code: "PRO_REQUIRED" });
    if (!result.ok) expect(result.error).toContain("part of Pro");
    expect(save).not.toHaveBeenCalled();
  });

  it("anyone may turn it OFF, even without Pro, and the Pro check is not even asked", async () => {
    const requireProFn = vi.fn(proNo);
    const { deps, save } = fakes({ requireProFn });
    const result = await applyShariaPreference("u1", false, deps);
    expect(result).toEqual({ ok: true, data: { enabled: false, backfill: "not_applicable" } });
    expect(save).toHaveBeenCalledWith("u1", false);
    expect(requireProFn).not.toHaveBeenCalled();
  });

  it("Pro turning ON is saved and starts one background fetch after the answer", async () => {
    const { deps, save, scheduled, run } = fakes();
    const result = await applyShariaPreference("u1", true, deps);
    expect(result).toEqual({ ok: true, data: { enabled: true, backfill: "started" } });
    expect(save).toHaveBeenCalledWith("u1", true);
    // Nothing has run yet: it was only scheduled.
    expect(run).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]();
    expect(run).toHaveBeenCalledOnce();
  });

  it("the backfill is skipped when screening is not set up (preference still saved)", async () => {
    const { deps, save, scheduled } = fakes({ vendor: null });
    const result = await applyShariaPreference("u1", true, deps);
    expect(result).toEqual({ ok: true, data: { enabled: true, backfill: "skipped" } });
    expect(save).toHaveBeenCalled();
    expect(scheduled).toHaveLength(0);
  });

  it("nothing to fetch when every stock already has a result", async () => {
    const { deps, scheduled } = fakes({ countCandidates: async () => 0 });
    const result = await applyShariaPreference("u1", true, deps);
    expect(result).toEqual({ ok: true, data: { enabled: true, backfill: "nothing_to_fetch" } });
    expect(scheduled).toHaveLength(0);
  });

  it("the backfill is limited to 3 an hour per person", async () => {
    const { deps, scheduled } = fakes();
    const outcomes: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await applyShariaPreference("u1", true, deps);
      if (r.ok) outcomes.push(r.data.backfill);
    }
    expect(outcomes).toEqual(["started", "started", "started", "rate_limited"]);
    expect(scheduled).toHaveLength(3);
  });

  it("the 31st change in a minute is rate limited", async () => {
    const { deps } = fakes();
    let last;
    for (let i = 0; i < 31; i++) last = await applyShariaPreference("u2", false, deps);
    expect(last?.ok).toBe(false);
    if (last && !last.ok) expect(last.error).toMatch(/Too many requests/);
  });
});
