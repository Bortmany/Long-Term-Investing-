// While the confirmation result is being worked out, the card says so —
// the page is never blank (go-public-ui.md §2.4).

import { LoaderCircle } from "lucide-react";

import { AuthShell } from "@/components/auth/auth-shell";
import { Card, CardContent } from "@/components/ui/card";

export default function VerifyEmailLoading() {
  return (
    <AuthShell>
      <Card className="w-full">
        <CardContent
          className="flex items-center justify-center gap-2 py-8 text-sm text-slate-600 dark:text-slate-300"
          role="status"
        >
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Confirming your email…
        </CardContent>
      </Card>
    </AuthShell>
  );
}
