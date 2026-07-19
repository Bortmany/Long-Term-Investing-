"use client";

// Delete-my-account (engineering-standards.md §6). Destructive-styled card;
// the actual confirm flow lives in DeleteAccountDialog (password +
// type-to-confirm).
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DeleteAccountDialog } from "./delete-account-dialog";

export function DangerCard() {
  const [dialogOpen, setDialogOpen] = React.useState(false);

  return (
    <Card className="border-red-200 dark:border-red-900">
      <CardHeader>
        <CardTitle className="text-red-600 dark:text-red-400">Danger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          This permanently deletes your account, portfolio, transactions,
          theses, alerts and AI analyses. There is no undo.
        </p>
        <Button type="button" variant="destructive" onClick={() => setDialogOpen(true)}>
          Delete my account
        </Button>
      </CardContent>
      {dialogOpen ? <DeleteAccountDialog onClose={() => setDialogOpen(false)} /> : null}
    </Card>
  );
}
