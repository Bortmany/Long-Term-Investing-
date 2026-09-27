"use client";

// Theme control: three choices (Light / Dark / System) in the shared
// DropdownMenu, replacing the old two-way Sun/Moon button. The trigger icon
// shows what is currently chosen; the open menu ticks it.
import { Check, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useTheme, type Theme } from "@/components/theme-provider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEME_OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

export function ThemeToggle({
  className,
  placement = "sidebar",
}: {
  className?: string;
  /**
   * Where in the shell this button sits, which decides where its little menu
   * opens — the same problem NotificationBell's `align` prop solves.
   * "sidebar" (default): near the LEFT edge and at the BOTTOM of the screen,
   * so the menu hangs from the left and opens upward. "topbar": the mobile
   * header's right edge, so it hangs from the right and opens downward.
   */
  placement?: "sidebar" | "topbar";
}) {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const current = THEME_OPTIONS.find((option) => option.value === theme) ?? THEME_OPTIONS[0];
  const TriggerIcon =
    theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;

  return (
    <DropdownMenu className={className}>
      <DropdownMenuTrigger>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Theme — currently ${current.label}`}
        >
          <TriggerIcon className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={placement === "topbar" ? "end" : "start"}
        className={placement === "sidebar" ? "top-auto bottom-full mt-0 mb-1" : undefined}
      >
        {THEME_OPTIONS.map((option) => {
          const Icon = option.icon;
          const selected = option.value === theme;
          return (
            <DropdownMenuItem
              key={option.value}
              role="menuitemradio"
              aria-checked={selected}
              onClick={() => setTheme(option.value)}
              className="flex items-center gap-2"
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              <span className="flex-1">{option.label}</span>
              {selected ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
