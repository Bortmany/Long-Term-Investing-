import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ImportWizard } from "@/components/import/import-wizard";

export const metadata = { title: "Import transactions — InvestIQ AI" };

// The import wizard (UI spec: broker-file-presets-ui.md). The page itself
// stays thin: the file is read in the browser, and every database step goes
// through the existing session-scoped server actions (a dry run first, then
// the all-or-nothing importTransactions).
export default async function ImportPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }

  // The stocks and funds InvestIQ tracks (just ticker and market) so the
  // browser can match a broker's tickers to them. Which rows were already
  // imported is looked up on the server from the signed-in user's own
  // portfolio — never from anything the browser sends.
  const instruments = await prisma.instrument.findMany({
    select: { ticker: true, market: true },
    orderBy: { ticker: "asc" },
  });

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Import transactions</h1>
      <ImportWizard
        instruments={instruments.map((i) => ({ ticker: i.ticker, market: i.market }))}
      />
    </>
  );
}
