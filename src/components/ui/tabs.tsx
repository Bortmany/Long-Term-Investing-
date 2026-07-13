"use client";

// Hand-written Tabs (no Radix installed) — controlled, context-based. The
// component API mirrors shadcn's Tabs so call sites read the same:
//   <Tabs value onValueChange><TabsList><TabsTrigger value>…</TabsList>
//   <TabsContent value>…</TabsContent></Tabs>
import * as React from "react";

import { cn } from "@/lib/utils";

type TabsContextValue = {
  value: string;
  onValueChange: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue | null>(null);

function useTabs(): TabsContextValue {
  const context = React.useContext(TabsContext);
  if (!context) {
    throw new Error("Tabs components must be used inside <Tabs>.");
  }
  return context;
}

function Tabs({
  value,
  onValueChange,
  className,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div data-slot="tabs" className={className}>
        {children}
      </div>
    </TabsContext.Provider>
  );
}

function TabsList({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="tabs-list"
      role="tablist"
      className={cn("flex gap-1 border-b border-slate-200 dark:border-slate-800", className)}
      {...props}
    />
  );
}

function TabsTrigger({
  value,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { value: string }) {
  const { value: activeValue, onValueChange } = useTabs();
  const active = value === activeValue;
  return (
    <button
      type="button"
      data-slot="tabs-trigger"
      role="tab"
      aria-selected={active}
      onClick={() => onValueChange(value)}
      className={cn(
        "-mb-px min-h-11 border-b-2 px-3 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-blue-600 text-blue-700 dark:border-blue-500 dark:text-blue-300"
          : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({
  value,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  const { value: activeValue } = useTabs();
  if (value !== activeValue) return null;
  return (
    <div
      data-slot="tabs-content"
      role="tabpanel"
      className={cn("pt-4", className)}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
