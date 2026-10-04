// The logic behind the Settings switch, kept apart from the server action so
// tests can inject fakes. The user id always comes from the session (the
// action), never from the client.
//
//  - Turning OFF is always allowed.
//  - Turning ON needs Pro, checked on the SERVER with requirePro.
//  - Turning ON also starts ONE background fetch of the person's own stocks
//    (at most 25, at most 3 an hour). It never blocks the answer, and does
//    nothing when screening is not set up.

import { prisma } from "@/lib/prisma";
import { actionError, actionOk, type ActionResult } from "@/lib/action-result";
import { requirePro } from "@/lib/plan-access";
import {
  rateLimit,
  rateLimitMessage,
  SHARIA_REFRESH_RATE_LIMIT,
  userKey,
  WRITE_ACTION_RATE_LIMIT,
} from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { activeVendorId, getActiveVendor } from "./config";
import {
  BACKFILL_MAX_INSTRUMENTS,
  countBackfillCandidates,
  refreshShariaScreens,
} from "./refresh";
import type { ShariaVendor } from "./vendor";

export const SHARIA_PRO_LABEL = "The Sharia screen";

/** What happened to the background fetch (drives the notice under the switch). */
export type BackfillOutcome = "started" | "nothing_to_fetch" | "skipped" | "rate_limited" | "not_applicable";

export type SetPreferenceDeps = {
  savePreference?: (userId: string, enabled: boolean) => Promise<void>;
  requireProFn?: (userId: string, label: string) => Promise<ActionResult<null>>;
  vendor?: ShariaVendor | null;
  countCandidates?: (userId: string, source: string) => Promise<number>;
  /** Runs work after the answer is sent. Defaults to nothing (the action passes Next's `after`). */
  schedule?: (work: () => Promise<void>) => void;
  runRefresh?: (userId: string, vendor: ShariaVendor) => Promise<unknown>;
};

export async function applyShariaPreference(
  userId: string,
  enabled: unknown,
  deps: SetPreferenceDeps = {},
): Promise<ActionResult<{ enabled: boolean; backfill: BackfillOutcome }>> {
  // A yes/no value only.
  if (typeof enabled !== "boolean") return actionError("Please choose On or Off.");

  const limited = rateLimit(userKey("settings-write", userId), WRITE_ACTION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  if (enabled) {
    const pro = await (deps.requireProFn ?? requirePro)(userId, SHARIA_PRO_LABEL);
    if (!pro.ok) return pro;
  }

  await (deps.savePreference ?? defaultSave)(userId, enabled);
  if (!enabled) return actionOk({ enabled: false, backfill: "not_applicable" });

  const vendor = deps.vendor !== undefined ? deps.vendor : getActiveVendor();
  if (!vendor) return actionOk({ enabled: true, backfill: "skipped" });

  const source = activeVendorId() ?? vendor.id;
  const count = await (deps.countCandidates ?? defaultCount)(userId, source).catch(() => 0);
  if (count === 0) return actionOk({ enabled: true, backfill: "nothing_to_fetch" });

  const backfillLimit = rateLimit(userKey("sharia-refresh", userId), SHARIA_REFRESH_RATE_LIMIT);
  if (!backfillLimit.ok) return actionOk({ enabled: true, backfill: "rate_limited" });

  const run = deps.runRefresh ?? defaultRun;
  (deps.schedule ?? ((work) => void work()))(async () => {
    try {
      await run(userId, vendor);
    } catch {
      logger.error("Sharia backfill failed");
    }
  });
  return actionOk({ enabled: true, backfill: "started" });
}

async function defaultSave(userId: string, enabled: boolean): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { shariaScreenEnabled: enabled } });
}

function defaultCount(userId: string, source: string): Promise<number> {
  return countBackfillCandidates(userId, { source });
}

function defaultRun(userId: string, vendor: ShariaVendor) {
  return refreshShariaScreens(
    { scope: { userId }, maxInstruments: BACKFILL_MAX_INSTRUMENTS, onlyWithoutUsableVerdict: true },
    { vendor },
  );
}
