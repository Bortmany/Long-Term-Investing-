"use client";

// Hand-written Sheet (slide-over drawer). @radix-ui/react-dialog is not
// installed, so this is a small controlled implementation: a fixed overlay
// that closes on click or Escape, plus a panel that slides in from a side.
// The component API mirrors shadcn's Sheet so call sites read the same.
import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type SheetContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SheetContext = React.createContext<SheetContextValue | null>(null);

function useSheet(): SheetContextValue {
  const context = React.useContext(SheetContext);
  if (!context) {
    throw new Error("Sheet components must be used inside <Sheet>.");
  }
  return context;
}

function Sheet({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  // Close on Escape while open.
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange]);

  return (
    <SheetContext.Provider value={{ open, onOpenChange }}>
      {children}
    </SheetContext.Provider>
  );
}

// Everything a keyboard user can land on. Used by the focus trap below.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function SheetContent({
  className,
  children,
  side = "left",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { side?: "left" | "right" }) {
  const { open, onOpenChange } = useSheet();
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Focus management for the modal claim (role="dialog" aria-modal="true"):
  // when the sheet opens, remember what had focus (the trigger button) and
  // move focus into the panel; when it closes, put focus back on the trigger.
  React.useEffect(() => {
    if (!open) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog) {
      const focusable = getFocusable(dialog);
      (focusable[0] ?? dialog).focus();
    }
    return () => {
      previouslyFocused?.focus();
    };
  }, [open]);

  // Trap Tab / Shift+Tab inside the panel while it is open, wrapping at the
  // ends, so keyboard focus can't escape into the page behind the overlay.
  function trapTab(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusable = getFocusable(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    const activeInside = active instanceof HTMLElement && dialog.contains(active);
    if (event.shiftKey) {
      if (active === first || active === dialog || !activeInside) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !activeInside) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!open) return null;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      onKeyDown={trapTab}
      className="fixed inset-0 z-50 outline-none"
      role="dialog"
      aria-modal="true"
    >
      {/* Overlay — click to close */}
      <div
        data-slot="sheet-overlay"
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div
        data-slot="sheet-content"
        className={cn(
          "absolute inset-y-0 flex w-72 max-w-[85vw] flex-col bg-background shadow-lg",
          side === "left" && "left-0 border-r",
          side === "right" && "right-0 border-l",
          className,
        )}
        {...props}
      >
        {children}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="absolute right-1 top-1 flex size-11 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    </div>
  );
}

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  );
}

function SheetTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      data-slot="sheet-title"
      className={cn("font-semibold text-foreground", className)}
      {...props}
    />
  );
}

export { Sheet, SheetContent, SheetHeader, SheetTitle };
