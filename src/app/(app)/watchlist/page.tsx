import { Eye } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Watchlist — InvestIQ AI" };

export default function WatchlistPage() {
  return (
    <EmptyState
      icon={Eye}
      heading="Watchlist"
      sentence="The stocks you're watching are coming here."
      comingSoon
    />
  );
}
