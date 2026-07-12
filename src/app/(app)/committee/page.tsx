import { Users } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Committee — InvestIQ AI" };

export default function CommitteePage() {
  return (
    <EmptyState
      icon={Users}
      heading="Committee"
      sentence="AI investment committee debates are coming here."
      comingSoon
    />
  );
}
