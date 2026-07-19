"use client";

// Hand-written DropdownMenu (no Radix installed) — a small non-modal popover
// for per-row actions (two or more; a single action should be a plain icon
// button instead). Context-based, mirrors shadcn's component shape. The panel
// is positioned with plain CSS (absolute below the trigger), which assumes no
// overflow-hidden ancestor clips it — an accepted trade for a personal tool
// with short tables, per the UI spec, rather than a bounding-rect engine.
// Closes on: item click, an outside mousedown, or Escape (Escape returns
// focus to the trigger). No focus trap — it's not modal.
import * as React from "react";

import { cn } from "@/lib/utils";

type DropdownMenuContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The wrapper element, used to detect outside mousedowns. */
  rootRef: React.RefObject<HTMLDivElement | null>;
  /** The trigger wrapper, so Escape can put focus back where it came from. */
  triggerRef: React.RefObject<HTMLSpanElement | null>;
};

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | null>(null);

function useDropdownMenu(): DropdownMenuContextValue {
  const context = React.useContext(DropdownMenuContext);
  if (!context) {
    throw new Error("DropdownMenu components must be used inside <DropdownMenu>.");
  }
  return context;
}

function DropdownMenu({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLSpanElement>(null);

  // Close on any mousedown outside the menu (trigger included in "inside").
  React.useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  // Close on Escape, returning focus to the trigger.
  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        const trigger = triggerRef.current?.querySelector<HTMLElement>("button, [tabindex]");
        (trigger ?? triggerRef.current)?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <DropdownMenuContext.Provider value={{ open, onOpenChange: setOpen, rootRef, triggerRef }}>
      <div ref={rootRef} data-slot="dropdown-menu" className={cn("relative inline-block", className)}>
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

/**
 * Wraps the trigger element (usually a ghost icon Button) and toggles the
 * menu on click. Rendered as a span wrapper so any child works unchanged.
 */
function DropdownMenuTrigger({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const { open, onOpenChange, triggerRef } = useDropdownMenu();
  return (
    <span
      ref={triggerRef}
      data-slot="dropdown-menu-trigger"
      className={cn("inline-flex", className)}
      onClick={() => onOpenChange(!open)}
    >
      {children}
    </span>
  );
}

function DropdownMenuContent({
  className,
  align = "end",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & {
  /**
   * Which edge of the trigger the panel hangs from. "end" (default, right-0)
   * suits row-action kebabs near the right edge of their container. "start"
   * (left-0) is for triggers that sit near the LEFT edge of the viewport —
   * e.g. the sidebar-anchored notification bell — where "end" would push a
   * wide panel off-screen to the left.
   */
  align?: "start" | "end";
}) {
  const { open } = useDropdownMenu();
  if (!open) return null;
  return (
    <div
      data-slot="dropdown-menu-content"
      role="menu"
      className={cn(
        "absolute top-full z-50 mt-1 min-w-40 rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-800 dark:bg-slate-900",
        align === "start" ? "left-0" : "right-0",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuItem({
  className,
  variant = "default",
  onClick,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** "destructive" renders delete-type items in red. */
  variant?: "default" | "destructive";
}) {
  const { onOpenChange } = useDropdownMenu();
  return (
    <button
      type="button"
      data-slot="dropdown-menu-item"
      role="menuitem"
      onClick={(event) => {
        onClick?.(event);
        onOpenChange(false);
      }}
      className={cn(
        "w-full px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-slate-100 focus-visible:bg-slate-100 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800",
        variant === "destructive" && "text-red-600 dark:text-red-400",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="dropdown-menu-separator"
      role="separator"
      className={cn("my-1 h-px bg-slate-200 dark:bg-slate-800", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
};
