import { Settings } from "lucide-react";

import { EmptyState } from "@/components/empty-state";

export const metadata = { title: "Settings — InvestIQ AI" };

export default function SettingsPage() {
  return (
    <EmptyState
      icon={Settings}
      heading="Settings"
      sentence="Preferences and API keys are coming here."
      comingSoon
    />
  );
}
