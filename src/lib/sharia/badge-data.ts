// getShariaBadgeData: the ONE function the three screens call.
//
// Returns NULL ("nothing to show") when the person has the switch off or is
// not on Pro, and in that case the verdict store is never queried and no
// space is reserved on the page. Otherwise it returns one entry per stock:
// Compliant, Not compliant or Not screened (with exactly one reason), decided
// only by the pure display rule. A page view makes no outside call.

import { prisma } from "@/lib/prisma";
import { isPro } from "@/lib/plan-access";
import { formatShortDate } from "@/lib/format";
import { logger } from "@/lib/logger";
import { activeVendorId, isShariaConfigured, vendorDisplayName } from "./config";
import { exchangeName } from "./coverage";
import { resolveShariaDisplay } from "./display";
import { readShariaScreens } from "./store";
import type { ShariaBadgeData, ShariaInstrumentRef, StoredShariaScreen } from "./types";

export type BadgeDataDeps = {
  loadPreference?: (userId: string) => Promise<boolean>;
  isProFn?: (userId: string) => Promise<boolean>;
  readScreens?: (ids: string[], source: string) => Promise<Map<string, StoredShariaScreen>>;
  activeVendor?: string | null;
  configured?: boolean;
  now?: Date;
};

async function defaultLoadPreference(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { shariaScreenEnabled: true },
  });
  return user?.shariaScreenEnabled ?? false;
}

/** True when this person should see Sharia badges at all (switch on AND Pro). */
export async function isShariaVisibleForUser(
  userId: string,
  deps: Pick<BadgeDataDeps, "loadPreference" | "isProFn"> = {},
): Promise<boolean> {
  const enabled = await (deps.loadPreference ?? defaultLoadPreference)(userId);
  if (!enabled) return false;
  return (deps.isProFn ?? isPro)(userId);
}

export async function getShariaBadgeData(
  userId: string,
  instruments: ShariaInstrumentRef[],
  deps: BadgeDataDeps = {},
): Promise<Record<string, ShariaBadgeData> | null> {
  try {
    if (!(await isShariaVisibleForUser(userId, deps))) return null;
  } catch {
    // If we cannot tell, show nothing rather than a guess.
    logger.warn("Could not read the Sharia screen preference");
    return null;
  }

  const activeVendor = deps.activeVendor !== undefined ? deps.activeVendor : activeVendorId();
  const configured = deps.configured ?? isShariaConfigured();
  const now = deps.now ?? new Date();
  const vendorName = vendorDisplayName(activeVendor ?? "");

  // Only look rows up when screening is actually set up.
  let rows = new Map<string, StoredShariaScreen>();
  if (configured && activeVendor && instruments.length > 0) {
    try {
      rows = await (deps.readScreens ?? readShariaScreens)(
        [...new Set(instruments.map((i) => i.id))],
        activeVendor,
      );
    } catch {
      logger.warn("Could not read stored Sharia screens");
      // Treated as "no verdict" for every stock: never a guess.
    }
  }

  const out: Record<string, ShariaBadgeData> = {};
  for (const instrument of instruments) {
    const display = resolveShariaDisplay({
      row: rows.get(instrument.id) ?? null,
      activeVendor,
      market: instrument.market,
      configured,
      now,
      onWarn: (message) => logger.warn(message),
    });
    const base = {
      stockName: instrument.name,
      ticker: instrument.ticker,
      exchangeName: exchangeName(instrument.market),
      vendorName,
    };
    if (display.state === "not_screened") {
      out[instrument.id] = {
        ...base,
        state: "not_screened",
        reason: display.reason,
        ...(display.staleAsOf ? { checkedLabel: formatShortDate(display.staleAsOf) } : {}),
      };
    } else {
      out[instrument.id] = {
        ...base,
        state: display.state,
        methodName: display.row.methodName,
        methodVersion: display.row.methodVersion,
        checkedLabel: formatShortDate(display.row.asOf),
        fetchedLabel: formatShortDate(display.row.fetchedAt),
      };
    }
  }
  return out;
}
