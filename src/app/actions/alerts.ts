"use server";

// Alerts & Notifications server actions, always scoped to the signed-in user
// (BUILD-PLAN.md Phase 7). Same skeleton as src/app/actions/theses.ts:
// session -> rate limit -> zod parse -> ownership check -> mutate -> revalidate.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  actionError,
  actionOk,
  NOT_SIGNED_IN_ERROR,
  type ActionResult,
} from "@/lib/action-result";
import { getSessionUserId } from "@/lib/user-portfolio";
import {
  rateLimit,
  rateLimitMessage,
  userKey,
  WRITE_ACTION_RATE_LIMIT,
} from "@/lib/rate-limit";
import { alertInputSchema, type AlertInput } from "@/lib/alert-schema";

function revalidateAlertPages() {
  revalidatePath("/watchlist");
}

const alertIdSchema = z
  .string({ error: "That alert could not be found." })
  .min(1, "That alert could not be found.");

/** An instrument is a legitimate price-alert target once the user holds or watches it. */
async function isInstrumentHeldOrWatched(userId: string, instrumentId: string): Promise<boolean> {
  const watched = await prisma.watchlistItem.findUnique({
    where: { userId_instrumentId: { userId, instrumentId } },
  });
  if (watched) return true;

  const portfolio = await prisma.portfolio.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (!portfolio) return false;

  const held = await prisma.transaction.findFirst({
    where: { portfolioId: portfolio.id, instrumentId },
  });
  return Boolean(held);
}

type AlertWriteData = {
  kind: AlertInput["kind"];
  instrumentId: string | null;
  threshold: number | null;
  thesisId: string | null;
  intervalDays: number | null;
};

/** Validate ownership of the alert's target (instrument or thesis) and build the write payload. */
async function buildAlertData(
  userId: string,
  data: AlertInput,
): Promise<{ ok: true; data: AlertWriteData } | { ok: false; error: string }> {
  if (data.kind === "THESIS_REVIEW_DUE") {
    const thesis = await prisma.thesis.findFirst({ where: { id: data.thesisId, userId } });
    if (!thesis) return { ok: false, error: "That thesis could not be found." };
    return {
      ok: true,
      data: {
        kind: data.kind,
        thesisId: thesis.id,
        intervalDays: data.intervalDays,
        instrumentId: null,
        threshold: null,
      },
    };
  }

  const instrument = await prisma.instrument.findUnique({ where: { id: data.instrumentId } });
  if (!instrument) return { ok: false, error: "That stock could not be found." };
  const eligible = await isInstrumentHeldOrWatched(userId, instrument.id);
  if (!eligible) {
    return { ok: false, error: "Watch or hold this stock before setting a price alert on it." };
  }
  return {
    ok: true,
    data: {
      kind: data.kind,
      instrumentId: instrument.id,
      threshold: data.threshold,
      thesisId: null,
      intervalDays: null,
    },
  };
}

export async function createAlert(input: AlertInput): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("alert-write", userId), WRITE_ACTION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsed = alertInputSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Please check the alert details.");
  }

  const built = await buildAlertData(userId, parsed.data);
  if (!built.ok) return actionError(built.error);

  const created = await prisma.alert.create({ data: { userId, ...built.data } });

  revalidateAlertPages();
  return actionOk({ id: created.id });
}

export async function updateAlert(
  alertId: string,
  input: AlertInput,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("alert-write", userId), WRITE_ACTION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsedId = alertIdSchema.safeParse(alertId);
  if (!parsedId.success) {
    return actionError(parsedId.error.issues[0]?.message ?? "That alert could not be found.");
  }

  // Ownership check: the row must belong to THIS signed-in user.
  const existing = await prisma.alert.findFirst({ where: { id: parsedId.data, userId } });
  if (!existing) return actionError("That alert could not be found.");

  const parsed = alertInputSchema.safeParse(input);
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? "Please check the alert details.");
  }

  const built = await buildAlertData(userId, parsed.data);
  if (!built.ok) return actionError(built.error);

  await prisma.alert.update({ where: { id: existing.id }, data: built.data });

  revalidateAlertPages();
  return actionOk({ id: existing.id });
}

export async function deleteAlert(alertId: string): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("alert-write", userId), WRITE_ACTION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsedId = alertIdSchema.safeParse(alertId);
  if (!parsedId.success) {
    return actionError(parsedId.error.issues[0]?.message ?? "That alert could not be found.");
  }

  // deleteMany with {id, userId} rather than delete({id}) — ownership stays
  // baked into the query itself, never a separate check that could drift.
  const result = await prisma.alert.deleteMany({ where: { id: parsedId.data, userId } });
  if (result.count === 0) return actionError("That alert could not be found.");

  revalidateAlertPages();
  return actionOk({ id: parsedId.data });
}

const alertStatusSchema = z.enum(["ACTIVE", "PAUSED"], {
  error: "Pick either Active or Paused.",
});

/**
 * Set an alert's status to ACTIVE or PAUSED — including re-arming a
 * TRIGGERED alert back to ACTIVE by hand (the only way price alerts re-arm;
 * thesis alerts also re-arm automatically once a newer check exists, see
 * src/lib/alerts/engine.ts). Setting ACTIVE also clears lastEvaluatedAt so
 * the alert is checked again right away instead of waiting out the last
 * evaluation's cooldown.
 */
export async function setAlertStatus(
  alertId: string,
  status: "ACTIVE" | "PAUSED",
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("alert-write", userId), WRITE_ACTION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsedId = alertIdSchema.safeParse(alertId);
  if (!parsedId.success) {
    return actionError(parsedId.error.issues[0]?.message ?? "That alert could not be found.");
  }
  const parsedStatus = alertStatusSchema.safeParse(status);
  if (!parsedStatus.success) {
    return actionError(parsedStatus.error.issues[0]?.message ?? "Pick either Active or Paused.");
  }

  const result = await prisma.alert.updateMany({
    where: { id: parsedId.data, userId },
    data: {
      status: parsedStatus.data,
      ...(parsedStatus.data === "ACTIVE" ? { lastEvaluatedAt: null } : {}),
    },
  });
  if (result.count === 0) return actionError("That alert could not be found.");

  revalidateAlertPages();
  return actionOk({ id: parsedId.data });
}

const notificationIdSchema = z
  .string({ error: "That notification could not be found." })
  .min(1, "That notification could not be found.");

export async function markNotificationRead(
  notificationId: string,
): Promise<ActionResult<{ id: string }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("notification-write", userId), WRITE_ACTION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const parsedId = notificationIdSchema.safeParse(notificationId);
  if (!parsedId.success) {
    return actionError(parsedId.error.issues[0]?.message ?? "That notification could not be found.");
  }

  await prisma.notification.updateMany({
    where: { id: parsedId.data, userId },
    data: { readAt: new Date() },
  });

  revalidateAlertPages();
  return actionOk({ id: parsedId.data });
}

export async function markAllNotificationsRead(): Promise<ActionResult<{ count: number }>> {
  const userId = await getSessionUserId();
  if (!userId) return actionError(NOT_SIGNED_IN_ERROR);

  const limited = rateLimit(userKey("notification-write", userId), WRITE_ACTION_RATE_LIMIT);
  if (!limited.ok) return actionError(rateLimitMessage(limited.retryAfterSeconds));

  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });

  revalidateAlertPages();
  return actionOk({ count: result.count });
}
