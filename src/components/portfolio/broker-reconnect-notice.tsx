// The amber notice at the top of the Portfolio page while the broker
// connection needs reconnecting (UI spec section 13). Not dismissible: it
// disappears by itself once reconnected, so it can't hide a real problem.
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

export function BrokerReconnectNotice({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Alert variant="warning" className="mb-4">
      <TriangleAlert aria-hidden="true" />
      <AlertDescription className="flex flex-col gap-x-4 sm:flex-row sm:items-center sm:justify-between">
        <p>Interactive Brokers needs reconnecting, so new trades aren&apos;t syncing.</p>
        <Link
          href="/settings#broker-connection"
          className="inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
        >
          Reconnect
        </Link>
      </AlertDescription>
    </Alert>
  );
}
