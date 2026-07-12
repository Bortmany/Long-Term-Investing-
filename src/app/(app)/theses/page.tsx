import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Theses — InvestIQ AI" };

export default function ThesesPage() {
  return (
    <EmptyState
      icon={BookOpen}
      heading="Theses"
      sentence="Your investment thesis tracker is coming here."
      comingSoon
    />
  );
}
