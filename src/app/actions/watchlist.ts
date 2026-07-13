"use server";

// Toggle whether an instrument is on the signed-in user's watchlist (the star
// on the Stocks table and the stock detail page). SECURITY RULE: the
// WatchlistItem is always keyed to the user id taken from the server session —
// a userId is never accepted from the client.

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getSessionUserId } from "@/lib/user-portfolio";

/**
 * Add or remove `instrumentId` from the signed-in user's watchlist. Returns
 * the resulting state so the UI can update the star immediately.
 */
export async function toggleWatch(
  instrumentId: string,
): Promise<ActionResult<{ watched: boolean }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  if (!instrumentId || typeof instrumentId !== "string") {
    return actionError("That instrument could not be found.");
  }

  const instrument = await prisma.instrument.findUnique({
    where: { id: instrumentId },
    select: { id: true },
  });
  if (!instrument) {
    return actionError("That instrument could not be found.");
  }

  const existing = await prisma.watchlistItem.findUnique({
    where: { userId_instrumentId: { userId, instrumentId } },
    select: { id: true },
  });

  let watched: boolean;
  if (existing) {
    await prisma.watchlistItem.delete({ where: { id: existing.id } });
    watched = false;
  } else {
    await prisma.watchlistItem.create({ data: { userId, instrumentId } });
    watched = true;
  }

  revalidatePath("/stocks");
  revalidatePath(`/stocks/${instrumentId}`);
  revalidatePath("/watchlist");
  return actionOk({ watched });
}
