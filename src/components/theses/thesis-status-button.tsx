"use client";

// Close/Reopen button on the thesis detail header (ui-spec §5.2) — the same
// useTransition + router.refresh() shape as WatchStar's optimistic toggle,
// simplified to a single labeled button rather than a star.
import * as React from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";

import { closeThesis, reopenThesis } from "@/app/actions/theses";
import { Button } from "@/components/ui/button";

export function ThesisStatusButton({
  thesisId,
  status,
}: {
  thesisId: string;
  status: "ACTIVE" | "CLOSED";
}) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  function onClick() {
    startTransition(async () => {
      const result =
        status === "ACTIVE" ? await closeThesis(thesisId) : await reopenThesis(thesisId);
      if (result.ok) {
        router.refresh();
      }
      // On failure the button simply returns to its normal state — nothing
      // changed, so there's nothing to revert.
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
      {status === "ACTIVE" ? "Close thesis" : "Reopen thesis"}
    </Button>
  );
}
