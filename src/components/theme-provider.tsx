"use client";

// Hand-rolled theme handling per the UI spec (no next-themes dependency):
// React context + localStorage + toggling the `dark` class on <html>.
// A tiny inline script in the root layout applies the saved theme before
// first paint to keep the flash of wrong theme minimal.
//
// Three choices, not two: "light", "dark", or "system" — "system" follows
// the device's own light/dark setting and keeps following it while the
// device switches (e.g. at sunset), which a saved "light"/"dark" never does.
import * as React from "react";

/** What the owner picked. */
export type Theme = "light" | "dark" | "system";
/** What is actually on screen right now ("system" resolved to one or the other). */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "investiq-theme";

/** The one media query that answers "is this device set to dark mode?". */
const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

type ThemeContextValue = {
  /** The saved choice: "light", "dark" or "system". */
  theme: Theme;
  /** The choice resolved to what's on screen — "system" becomes light or dark. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
};

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

/** What the device itself is set to right now. Falls back to light if we can't tell. */
function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  try {
    return window.matchMedia(DARK_MEDIA_QUERY).matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    // Anything already saved by an earlier version ("light"/"dark") keeps
    // working exactly as before; anything else means "follow the device",
    // which is what the app did by default before this option existed.
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
    return "system";
  } catch {
    return "system";
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = React.useState<Theme>(readInitialTheme);
  const [systemTheme, setSystemTheme] = React.useState<ResolvedTheme>(readSystemTheme);

  // Keep listening to the device setting so a switch there is picked up live
  // while the choice is "system". (The listener runs whatever the choice is;
  // its value is only USED when the choice is "system", just below.)
  React.useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(DARK_MEDIA_QUERY);
    const apply = () => setSystemTheme(query.matches ? "dark" : "light");
    apply(); // catch a change that happened before this effect ran
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // localStorage unavailable (private mode etc.) — theme still applies.
    }
  }, [theme]);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used inside <ThemeProvider>.");
  }
  return context;
}

/**
 * Inline script source for the root layout: applies the saved (or system)
 * theme before React hydrates, so dark mode doesn't flash white.
 * "dark"/"light" are honoured as saved; "system" (and anything unsaved) asks
 * the device — the same resolution readInitialTheme does above.
 */
export const themeInitScript = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});var d=t==="dark"||(t!=="light"&&matchMedia(${JSON.stringify(
  DARK_MEDIA_QUERY,
)}).matches);if(d)document.documentElement.classList.add("dark")}catch(e){}`;
