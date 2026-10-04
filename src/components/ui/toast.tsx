"use client";

// Hand-written toast (no extra package). A short message at the bottom of the
// screen that confirms what just happened and, for removals, offers an Undo.
// Mounted ONCE in the signed-in layout so a toast stays on screen even when
// the row that caused it disappears from a list.
//
//   const { toast } = useToast();
//   toast({ message: "JNJ added to your watchlist." });
//   toast({ message: "JNJ removed", action: { label: "Undo", run: async () => ... } });
//
// Timing: plain 4s, with an Undo 8s, error 6s. The timer pauses while the
// pointer is over the toast or something inside it has focus. Up to 3 at once.
import * as React from "react";
import { CircleAlert, LoaderCircle, X } from "lucide-react";

import { cn } from "@/lib/utils";

export type ToastInput = {
  message: string;
  /** "error" uses a warning icon and a longer stay; never a red fill. */
  tone?: "default" | "error";
  /** The Undo button. `run` returns a follow-up message (or null to just close). */
  action?: {
    label: string;
    ariaLabel?: string;
    run: () => Promise<{ message: string; tone?: "default" | "error" } | null>;
  };
};

type ToastItem = ToastInput & { id: number; busy: boolean };

type ToastContextValue = { toast: (input: ToastInput) => void };

const ToastContext = React.createContext<ToastContextValue>({ toast: () => {} });

export function useToast(): ToastContextValue {
  return React.useContext(ToastContext);
}

const MAX_TOASTS = 3;

/** How long a toast stays: 8s with an Undo, 6s for an error, otherwise 4s. */
export function toastDurationMs(input: Pick<ToastInput, "tone" | "action">): number {
  if (input.action) return 8000;
  if (input.tone === "error") return 6000;
  return 4000;
}

function ToastCard({
  item,
  onClose,
  onReplace,
}: {
  item: ToastItem;
  onClose: (id: number) => void;
  onReplace: (id: number, next: ToastInput) => void;
}) {
  const [paused, setPaused] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (paused || busy) return;
    const timer = window.setTimeout(() => onClose(item.id), toastDurationMs(item));
    return () => window.clearTimeout(timer);
  }, [paused, busy, item, onClose]);

  async function runAction() {
    if (!item.action || busy) return;
    setBusy(true);
    const next = await item.action.run().catch(() => ({
      message: "Something went wrong. Please try again.",
      tone: "error" as const,
    }));
    setBusy(false);
    if (next) onReplace(item.id, next);
    else onClose(item.id);
  }

  return (
    <div
      role={item.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose(item.id);
      }}
      className="pointer-events-auto flex min-h-12 w-full items-center gap-3 rounded-lg bg-slate-900 px-4 py-3 text-sm text-slate-50 shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 dark:bg-slate-50 dark:text-slate-900 sm:w-fit sm:min-w-80 sm:max-w-105"
    >
      {item.tone === "error" ? (
        <CircleAlert
          aria-hidden="true"
          className="size-4 shrink-0 text-amber-300 dark:text-amber-700"
        />
      ) : null}
      <p className="flex-1 text-left">{item.message}</p>
      {item.action ? (
        <button
          type="button"
          onClick={runAction}
          disabled={busy}
          aria-label={item.action.ariaLabel ?? item.action.label}
          className={cn(
            "inline-flex min-h-11 min-w-14 items-center justify-center gap-1.5 rounded-md px-2 text-sm font-medium text-blue-300 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-blue-300 disabled:opacity-60 dark:text-blue-700 dark:focus-visible:ring-blue-700",
          )}
        >
          {busy ? (
            <>
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Undoing…
            </>
          ) : (
            item.action.label
          )}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onClose(item.id)}
        aria-label="Dismiss"
        title="Dismiss"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-md outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-blue-300 dark:hover:bg-slate-900/10 dark:focus-visible:ring-blue-700"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(1);

  const close = React.useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback((input: ToastInput) => {
    const id = nextId.current++;
    setItems((current) => [...current, { ...input, id, busy: false }].slice(-MAX_TOASTS));
  }, []);

  const replace = React.useCallback((id: number, next: ToastInput) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...next, id, busy: false } : item)),
    );
  }, []);

  const value = React.useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom)+var(--bottom-nav-height,0px))] z-50 flex flex-col items-center gap-2 sm:bottom-6"
      >
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onClose={close} onReplace={replace} />
        ))}
      </section>
    </ToastContext.Provider>
  );
}
