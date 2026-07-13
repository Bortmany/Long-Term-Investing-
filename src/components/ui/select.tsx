"use client";

// Hand-written Select — a deliberate, documented deviation from a
// shadcn-style floating listbox: this is a styled wrapper around the NATIVE
// <select> element, visually matching Input. With no Radix installed, a
// compound floating listbox would mean a lot of hand-rolled positioning,
// keyboard, and scroll-lock code to buy back what the native element already
// gives for free (full keyboard support, screen-reader support, the
// mobile-native picker on touch devices). The right trade for a personal tool.
import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
};

export type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  /** Shown as a disabled first option while `value` is empty. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
} & Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "value" | "onChange" | "children" | "disabled" | "className"
>;

function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled = false,
  className,
  ...props
}: SelectProps) {
  return (
    <div className={cn("relative w-full", className)}>
      <select
        data-slot="select"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        disabled={disabled}
        className={cn(
          // Matches Input's visuals; appearance-none hides the native arrow
          // so the ChevronDown below is the only indicator. pr-9 keeps text
          // clear of the icon.
          "h-10 w-full appearance-none rounded-md border border-input bg-transparent px-3 pr-9 text-sm shadow-sm transition-colors outline-none",
          "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
          disabled && "cursor-not-allowed opacity-50",
        )}
        {...props}
      >
        {placeholder !== undefined ? (
          <option value="" disabled>
            {placeholder}
          </option>
        ) : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  );
}

export { Select };
