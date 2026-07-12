import { Briefcase } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Portfolio — InvestIQ AI" };

export default function PortfolioPage() {
  return (
    <EmptyState
      icon={Briefcase}
      heading="Portfolio"
      sentence="Full holdings and dividend tracking are coming here."
      comingSoon
    />
  );
}
