"use client";

// Hand-written Popover (no new library), modelled on sheet.tsx and tooltip.tsx.
// One component, two looks chosen by screen width:
//   - under 768px: a bottom sheet (dark backdrop, full width, slides up);
//   - 768px and up: a small floating card next to the thing you tapped.
// Opens by the caller's trigger (tap, click, Enter or Space); closes on
// Escape, tapping outside and the close button; traps Tab in the phone look;
// puts focus back on the trigger when it closes; role="dialog".
//
// The floating card is drawn with FIXED positioning from the trigger's
// on-screen position and rendered in a portal on the page body, never inside
// a table, because the table wrapper (overflow-x-auto) would cut it off.

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const WIDE_QUERY = "(min-width: 768px)";

function subscribeWide(callback: () => void) {
  const media = window.matchMedia(WIDE_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function useIsWide(): boolean {
  return React.useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

// Only one popover is open at a time: opening one announces itself and the
// others close.
const OPEN_EVENT = "investiq-popover-open";

export type PopoverProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trigger element; the card is placed beside it and focus returns to it. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /** Id of the element that names the dialog (for screen readers). */
  labelledBy: string;
  /** Text for the phone "Got it" button. Omit to leave the button out. */
  closeLabel?: string;
  children: React.ReactNode;
};

export function Popover({
  open,
  onOpenChange,
  anchorRef,
  labelledBy,
  closeLabel,
  children,
}: PopoverProps) {
  const wide = useIsWide();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const id = React.useId();
  const [position, setPosition] = React.useState<{ top: number; left: number } | null>(null);

  // Close this one when another popover opens.
  React.useEffect(() => {
    if (!open) return;
    function onOther(event: Event) {
      if ((event as CustomEvent<string>).detail !== id) onOpenChange(false);
    }
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: id }));
    window.addEventListener(OPEN_EVENT, onOther);
    return () => window.removeEventListener(OPEN_EVENT, onOther);
  }, [open, id, onOpenChange]);

  // Escape closes (both looks).
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  // Focus: into the panel on open, back on the trigger on close.
  React.useEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    panelRef.current?.focus();
    return () => anchor?.focus();
  }, [open, anchorRef]);

  // Floating look: tap/click anywhere else closes it; scrolling closes it.
  React.useEffect(() => {
    if (!open || !wide) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node | null;
      if (target && (panelRef.current?.contains(target) || anchorRef.current?.contains(target))) return;
      onOpenChange(false);
    }
    function onScroll() {
      onOpenChange(false);
    }
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open, wide, onOpenChange, anchorRef]);

  // Place the floating card: below the trigger with an 8px gap, left edges
  // aligned; above if there is no room below; shifted left near the right edge.
  React.useLayoutEffect(() => {
    if (!open || !wide) return;
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const rect = anchor.getBoundingClientRect();
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const margin = 16;
    let left = rect.left;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width;
    left = Math.max(margin, left);
    let top = rect.bottom + 8;
    if (top + height > window.innerHeight - margin && rect.top - 8 - height >= margin) {
      top = rect.top - 8 - height;
    }
    setPosition({ top, left });
  }, [open, wide, anchorRef]);

  function trapTab(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || wide) return; // trap in the phone look only
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const inside = active instanceof HTMLElement && panel.contains(active);
    if (event.shiftKey) {
      if (active === first || active === panel || !inside) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !inside) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open || typeof document === "undefined") return null;

  const closeButton = (
    <button
      type="button"
      onClick={() => onOpenChange(false)}
      className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <X className="size-4" aria-hidden="true" />
      <span className="sr-only">Close</span>
    </button>
  );

  if (wide) {
    return createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-slot="popover-card"
        style={{
          position: "fixed",
          top: position?.top ?? 0,
          left: position?.left ?? 0,
          visibility: position ? "visible" : "hidden",
        }}
        className="z-50 w-80 max-w-[360px] rounded-lg border border-slate-200 bg-background p-4 pr-12 shadow-md outline-none dark:border-slate-800"
      >
        {children}
        {closeButton}
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50" onKeyDown={trapTab}>
      <div
        data-slot="popover-backdrop"
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        data-slot="popover-sheet"
        className={cn(
          "absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto rounded-t-xl border-t border-slate-200 bg-background p-4 pt-6 shadow-lg outline-none",
          "animate-in slide-in-from-bottom duration-200 dark:border-slate-800",
        )}
      >
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-2 h-1 w-9 -translate-x-1/2 rounded-full bg-slate-300 dark:bg-slate-700"
        />
        {children}
        {closeLabel ? (
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-md border border-border bg-background text-sm font-medium shadow-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            {closeLabel}
          </button>
        ) : null}
        {closeButton}
      </div>
    </div>,
    document.body,
  );
}
