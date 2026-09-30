"use client";

// Small shared pieces for the account-access screens: the password box with
// a show/hide eye, a 60-second countdown, the round icon badge, and the
// "Back to sign in"-style text link. Same styling as the existing forms.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

import { errorFieldClass } from "@/lib/auth-schema";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** A text link with a 44px tap height (go-public-ui.md §0 fix 1). */
export const tapLinkClass =
  "inline-flex min-h-11 items-center rounded-sm text-blue-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-blue-400";

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={tapLinkClass}>
      {children}
    </Link>
  );
}

/** A 28px icon in a 56px circle, like the app's empty states. */
export function IconBadge({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "slate" | "green";
}) {
  return (
    <div
      className={cn(
        "mx-auto flex size-14 items-center justify-center rounded-full [&>svg]:size-7",
        tone === "green"
          ? "bg-green-50 text-green-600 dark:bg-green-950 dark:text-green-400"
          : "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
      )}
      aria-hidden="true"
    >
      {children}
    </div>
  );
}

/** Password box with a 44px show/hide eye button inside it. */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  invalid,
  disabled,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password";
  invalid?: boolean;
  disabled?: boolean;
  describedBy?: string;
}) {
  const [visible, setVisible] = useState(false);
  const label = visible ? "Hide password" : "Show password";
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        placeholder="••••••••"
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn("h-11 pr-12", invalid ? errorFieldClass : undefined)}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        disabled={disabled}
        className="absolute inset-y-0 right-0 flex size-11 items-center justify-center rounded-md text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:text-slate-400 dark:hover:text-slate-200"
      >
        {visible ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
      </button>
    </div>
  );
}

/**
 * A countdown in whole seconds. `start(n)` begins counting down from n;
 * `remaining` is 0 when idle.
 */
export function useCountdown(initialSeconds = 0) {
  const [endsAt, setEndsAt] = useState<number | null>(() =>
    initialSeconds > 0 ? Date.now() + initialSeconds * 1000 : null,
  );
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) setEndsAt(null);
    };
    tick();
    const timer = setInterval(tick, 250);
    return () => clearInterval(timer);
  }, [endsAt]);

  return {
    remaining,
    start: (seconds: number) => {
      setRemaining(seconds);
      setEndsAt(Date.now() + seconds * 1000);
    },
  };
}
