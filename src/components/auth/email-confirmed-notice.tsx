"use client";

// "Email confirmed. Welcome to InvestIQ." (go-public-ui.md §2.4). Shown at
// the top of the dashboard right after someone clicks their confirmation
// link. It has a 44px close button, and it goes away on its own after 8
// seconds — but only if the person isn't hovering over or focused on it.

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";

const AUTO_HIDE_MS = 8000;

export function EmailConfirmedNotice() {
  const [open, setOpen] = useState(true);
  const [held, setHeld] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function dismiss() {
    setOpen(false);
    // Drop "?verified=1" from the address bar so a refresh doesn't show it again.
    const url = new URL(window.location.href);
    url.searchParams.delete("verified");
    window.history.replaceState(window.history.state, "", url.pathname + url.search);
  }

  useEffect(() => {
    if (!open || held) return;
    timer.current = setTimeout(dismiss, AUTO_HIDE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open, held]);

  if (!open) return null;

  return (
    <div
      className="mb-4"
      onMouseEnter={() => setHeld(true)}
      onFocus={() => setHeld(true)}
    >
      <Alert variant="success" className="flex items-center justify-between gap-2 py-1 pr-1">
        <AlertDescription className="text-green-600 dark:text-green-400">
          Email confirmed. Welcome to InvestIQ.
        </AlertDescription>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          title="Dismiss"
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-green-700 hover:bg-green-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-green-400 dark:hover:bg-green-950"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </Alert>
    </div>
  );
}
