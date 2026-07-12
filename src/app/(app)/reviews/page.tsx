import { ClipboardCheck } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Reviews — InvestIQ AI" };

export default function ReviewsPage() {
  return (
    <EmptyState
      icon={ClipboardCheck}
      heading="Reviews"
      sentence="AI weekly portfolio reviews are coming here."
      comingSoon
    />
  );
}
