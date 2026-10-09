// The two plans, their AI limits, their prices and what each one includes —
// the single place every screen reads them from (landing page, Settings'
// Plans card, the AI spend cap). Later steps switch a feature on by changing
// its `status` here, in one line.
//
// Pure data: no database, no Stripe, no network.

export type PlanName = "FREE" | "PRO";

export const PLAN_LIMITS = {
  FREE: { dailyAi: 2 },
  PRO: { dailyAi: 10, monthlyAi: 150 },
} as const;

// USD. Shown on screen only; Stripe's price ids (from the environment) are
// what actually gets charged.
export const PRICING = {
  proMonthlyUsd: 9.99,
  proYearlyUsd: 89,
} as const;

export type PlanFeatureStatus = "available" | "coming_soon";

export interface PlanFeature {
  key: string;
  label: string;
  // The cheapest plan that includes it.
  plan: PlanName;
  status: PlanFeatureStatus;
}

export const PLAN_FEATURES: readonly PlanFeature[] = [
  { key: "tracking", label: "Portfolio tracking, dashboard and stock pages", plan: "FREE", status: "available" },
  { key: "source-badges", label: "Every number shows where it came from", plan: "FREE", status: "available" },
  { key: "csv-import", label: "CSV import", plan: "FREE", status: "available" },
  { key: "broker-presets", label: "Ready-made broker file formats", plan: "FREE", status: "available" },
  { key: "price-alerts", label: "Price alerts", plan: "FREE", status: "available" },
  { key: "data-rights", label: "Download your data or delete your account", plan: "FREE", status: "available" },
  { key: "ai-free", label: "2 new AI analyses a day", plan: "FREE", status: "available" },
  { key: "ai-pro", label: "10 new AI analyses a day (up to 150 a month)", plan: "PRO", status: "available" },
  { key: "committee", label: "Full Investment Committee", plan: "PRO", status: "available" },
  { key: "thesis-checks", label: "AI thesis check-ups", plan: "PRO", status: "available" },
  { key: "weekly-review", label: "Weekly AI review", plan: "PRO", status: "available" },
  { key: "review-alerts", label: "\"Time to review\" alerts", plan: "PRO", status: "available" },
  { key: "broker-connection", label: "Read-only broker connection", plan: "PRO", status: "coming_soon" },
  { key: "sharia-badge", label: "Sharia screen badge", plan: "PRO", status: "coming_soon" },
];
