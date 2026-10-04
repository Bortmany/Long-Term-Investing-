"use client";

// Screen 1: "Which broker?" (UI spec section 2). One whole-card button per
// choice. Phone: a single column list with a chevron. Wider: a grid of
// vertical cards. The two fallback cards (template, Other) have a dashed
// border. Nothing is guessed: choosing a card is the only way forward.

import * as React from "react";
import { Check, ChevronRight, Columns3, FileDown } from "lucide-react";

import { PRESET_CARDS, type PresetCard } from "@/lib/import-presets";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type BrokerChoice = PresetCard["id"];

const INITIALS: Partial<Record<BrokerChoice, string>> = {
  ibkr: "IB",
  saxo: "S",
  trading212: "212",
  etoro: "e",
  schwab: "CS",
  fidelity: "F",
};

function Chip({ id }: { id: BrokerChoice }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
    >
      {id === "template" ? (
        <FileDown className="size-5" />
      ) : id === "other" ? (
        <Columns3 className="size-5" />
      ) : (
        INITIALS[id]
      )}
    </span>
  );
}

function BetaTag({ className }: { className?: string }) {
  return (
    <Tooltip className={className}>
      {/* Decorative inside a button: not a separate tab stop. */}
      <TooltipTrigger tabIndex={-1} aria-hidden="true">
        <Badge variant="secondary">Beta</Badge>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="right-0 left-auto translate-x-0">
        Not yet tried on a real file
      </TooltipContent>
    </Tooltip>
  );
}

export function BrokerGrid({
  selected,
  onChoose,
}: {
  selected: BrokerChoice | null;
  onChoose: (id: BrokerChoice) => void;
}) {
  const brokers = PRESET_CARDS.filter((c) => c.id !== "template" && c.id !== "other");
  const fallbacks = PRESET_CARDS.filter((c) => c.id === "template" || c.id === "other");

  function renderCard(card: PresetCard, dashed: boolean) {
    const isSelected = selected === card.id;
    return (
      <button
        key={card.id}
        type="button"
        onClick={() => onChoose(card.id)}
        aria-label={card.beta ? `${card.name}, Beta` : card.name}
        aria-pressed={isSelected}
        className={cn(
          "relative flex min-h-[72px] w-full items-center gap-3 rounded-lg border p-4 text-left outline-none transition-colors",
          "hover:border-slate-400 hover:bg-slate-50 active:bg-slate-100 focus-visible:ring-2 focus-visible:ring-ring",
          "dark:hover:border-slate-600 dark:hover:bg-slate-900 dark:active:bg-slate-800",
          "sm:flex-col sm:items-start sm:gap-3",
          dashed ? "border-dashed" : null,
          isSelected
            ? "border-blue-600 dark:border-blue-500"
            : "border-slate-300 dark:border-slate-700",
        )}
      >
        <Chip id={card.id} />
        <span className="min-w-0 flex-1 sm:flex-none">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-base font-medium">{card.name}</span>
            {card.beta ? <BetaTag className="sm:hidden" /> : null}
          </span>
          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
            {card.hint}
          </span>
        </span>
        {card.beta ? (
          <BetaTag className="hidden sm:absolute sm:top-4 sm:right-4 sm:inline-flex" />
        ) : null}
        {isSelected ? (
          <Check
            className="size-5 shrink-0 text-blue-600 sm:absolute sm:right-4 sm:bottom-4 dark:text-blue-400"
            aria-label="Your choice"
          />
        ) : (
          <ChevronRight
            className="size-5 shrink-0 text-slate-400 sm:hidden dark:text-slate-500"
            aria-hidden="true"
          />
        )}
      </button>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
      {brokers.map((card) => renderCard(card, false))}
      <p className="col-span-full mt-3 text-xs text-slate-500 sm:hidden dark:text-slate-400">
        Not on the list?
      </p>
      {fallbacks.map((card) => renderCard(card, true))}
    </div>
  );
}
