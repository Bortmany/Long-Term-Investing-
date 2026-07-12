import { ChartLine } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Stocks — InvestIQ AI" };

export default function StocksPage() {
  return (
    <EmptyState
      icon={ChartLine}
      heading="Stocks"
      sentence="Stock analysis pages with an AI health score are coming here."
      comingSoon
    />
  );
}
