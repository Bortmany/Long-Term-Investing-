"use client";

// Sticky section links for the long stock research page: jump to a part of
// the page, and see which part you're currently reading. Pure navigation —
// it shows no figures of its own, so there is nothing here to badge.
//
// The page itself stays a Server Component: it only puts an `id` on each
// section, and this small client component finds those ids and watches them
// with an IntersectionObserver.
import * as React from "react";

import { cn } from "@/lib/utils";

export type SectionNavItem = { id: string; label: string };

/** How far below the top of the screen a section counts as "the one being read". */
const TOP_OFFSET_PX = 96;

export function StockSectionNav({ sections }: { sections: SectionNavItem[] }) {
  const [activeId, setActiveId] = React.useState(sections[0]?.id ?? "");
  // A plain string so the effect below has one stable dependency (a fresh
  // array arrives from the server component on every render).
  const sectionKey = sections.map((section) => section.id).join(",");

  React.useEffect(() => {
    const ids = sectionKey.split(",").filter(Boolean);
    if (ids.length === 0 || typeof IntersectionObserver !== "function") return;

    const onScreen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onScreen.add(entry.target.id);
          else onScreen.delete(entry.target.id);
        }
        // The highest section still inside the reading band wins.
        const current = ids.find((id) => onScreen.has(id));
        if (current) setActiveId(current);
      },
      { rootMargin: `-${TOP_OFFSET_PX}px 0px -55% 0px`, threshold: 0 },
    );

    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [sectionKey]);

  function handleClick(event: React.MouseEvent<HTMLAnchorElement>, id: string) {
    const element = document.getElementById(id);
    if (!element) return; // let the plain link do its job
    event.preventDefault();
    const reduceMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    setActiveId(id);
  }

  return (
    <nav
      aria-label="Sections of this page"
      className="sticky top-14 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 md:top-0 lg:-mx-8 lg:px-8 dark:border-slate-800 dark:bg-slate-950/95"
    >
      <ul className="flex gap-1 overflow-x-auto">
        {sections.map((section) => {
          const active = section.id === activeId;
          return (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                onClick={(event) => handleClick(event, section.id)}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "block whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  active
                    ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
                )}
              >
                {section.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
