// "Download my data" (engineering-standards.md §6). A plain download link —
// no client state needed, so this stays a server-renderable component.
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function YourDataCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your data</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Download everything InvestIQ AI stores about your account — your
          profile, portfolio and transactions, watchlist, theses, AI
          analyses, alerts and sign-in history — as one JSON file.
        </p>
        <Button asChild variant="outline">
          <a href="/api/account/export" download>
            <Download aria-hidden="true" />
            Download my data
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}
