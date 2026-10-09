// Which page-level notice /committee shows before any stock is picked.
// Same order as the AI panel: the Pro gate first, then "no AI key".
// Only the full Committee is Pro; the Upside / Downside checks are on every plan.

export type CommitteePageNotice = "pro" | "no-key" | null;

export function committeePageNotice(input: {
  hasStock: boolean;
  mode: "committee" | "buy" | "sell";
  proLocked: boolean;
  hasAiKey: boolean;
}): CommitteePageNotice {
  if (input.hasStock) return null;
  if (input.mode === "committee" && input.proLocked) return "pro";
  if (!input.hasAiKey) return "no-key";
  return null;
}
