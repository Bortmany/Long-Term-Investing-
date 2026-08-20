import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { NotificationBell, type NotificationBellItem } from "@/components/notification-bell";
import { describeAlertTrigger } from "@/lib/alerts/describe";
import { sweepAlertsForUserThrottled } from "@/lib/alerts/engine";

// Latest notifications shown in the bell's panel (BUILD-PLAN.md Phase 7).
const NOTIFICATION_BELL_ITEM_LIMIT = 10;

// Layout for every authenticated page: validates the session server-side
// (src/proxy.ts only checks the cookie optimistically) and wraps the page
// in the app shell (sidebar / rail / mobile drawer).
export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: this intentionally duplicates src/proxy.ts's check — the proxy only sees the cookie and never validates the session, so it alone is not sufficient.
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    redirect("/sign-in");
  }
  const userId = session.user.id;

  // Session-activity trigger (BUILD-PLAN.md Phase 7): sweep this user's due
  // alerts once per page load, AFTER the response is sent (next/server's
  // after()) so it never slows down navigation. Throttled to at most once
  // per 10 minutes per user and hardened to never throw — see
  // sweepAlertsForUserThrottled's own doc comment in src/lib/alerts/engine.ts.
  // userId is read above (before after()), per Next's own guidance that
  // Server Components can't call request-time APIs from inside the callback.
  after(() => sweepAlertsForUserThrottled(userId));

  const [unreadCount, notificationRows] = await Promise.all([
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: NOTIFICATION_BELL_ITEM_LIMIT,
      // The alert behind each notification, so the bell can say what the
      // owner had asked for next to what actually happened. It may be null:
      // deleting an alert leaves its past notifications in place.
      include: {
        alert: {
          select: {
            kind: true,
            threshold: true,
            intervalDays: true,
            instrument: { select: { currency: true } },
          },
        },
      },
    }),
  ]);

  const notificationItems: NotificationBellItem[] = notificationRows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    createdAt: row.createdAt,
    readAt: row.readAt,
    priceAtTrigger: row.priceAtTrigger === null ? null : row.priceAtTrigger.toNumber(),
    priceCurrency: row.priceCurrency,
    priceSource: row.priceSource,
    priceAsOf: row.priceAsOf,
    explanation: row.alert
      ? describeAlertTrigger({
          kind: row.alert.kind,
          threshold:
            row.alert.threshold === null ? null : row.alert.threshold.toNumber(),
          currency: row.alert.instrument?.currency ?? row.priceCurrency ?? null,
          intervalDays: row.alert.intervalDays,
        })
      : null,
  }));

  return (
    <AppShell
      email={session.user.email}
      notificationBellSidebar={
        <NotificationBell
          initialUnreadCount={unreadCount}
          initialItems={notificationItems}
          align="start"
        />
      }
      notificationBellMobile={
        <NotificationBell
          initialUnreadCount={unreadCount}
          initialItems={notificationItems}
          align="end"
        />
      }
    >
      {children}
    </AppShell>
  );
}
