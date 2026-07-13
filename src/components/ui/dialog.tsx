"use client";

// Hand-written Dialog (centered modal). @radix-ui/react-dialog is not
// installed, so this is a small controlled implementation built the same way
// Sheet was: a fixed overlay that closes on click or Escape, plus a centered
// panel with the same focus-trap/focus-restore logic (copied from Sheet, not
// re-derived). The component API mirrors shadcn's Dialog so call sites read
// the same.
import * as React from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

type DialogContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Id that DialogTitle renders with and the panel is labelled by. */
  titleId: string;
};

const DialogContext = React.createContext<DialogContextValue | null>(null);

function useDialog(): DialogContextValue {
  const context = React.useContext(DialogContext);
  if (!context) {
    throw new Error("Dialog components must be used inside <Dialog>.");
  }
  return context;
}

function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const titleId = React.useId();

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
    <DialogContext.Provider value={{ open, onOpenChange, titleId }}>
      {children}
    </DialogContext.Provider>
  );
}

// Everything a keyboard user can land on. Used by the focus trap below.
// (Copied from Sheet — keep the two in sync.)
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

function DialogContent({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  const { open, onOpenChange, titleId } = useDialog();
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Focus management for the modal claim (role="dialog" aria-modal="true"):
  // when the dialog opens, remember what had focus (the trigger button) and
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Overlay — click to close */}
      <div
        data-slot="dialog-overlay"
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
      />
      <div
        data-slot="dialog-content"
        className={cn(
          // Centered panel. On screens <640px the p-4 on the positioning
          // wrapper plus w-full makes it near-full-width (inset-x-4
          // effectively); taller-than-viewport content scrolls internally.
          // Call sites override the max-width (max-w-md / max-w-lg / …) via
          // className; max-w-md is the default for short forms.
          "relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-slate-200 bg-white p-6 shadow-lg dark:border-slate-800 dark:bg-slate-900",
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

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-1.5", className)}
      {...props}
    />
  );
}

function DialogTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const { titleId } = useDialog();
  return (
    <h2
      id={titleId}
      data-slot="dialog-title"
      className={cn("text-lg font-semibold text-foreground", className)}
      {...props}
    />
  );
}

function DialogDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

/** Footer — always Cancel first, primary action last. */
function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("mt-6 flex justify-end gap-3", className)}
      {...props}
    />
  );
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter };
