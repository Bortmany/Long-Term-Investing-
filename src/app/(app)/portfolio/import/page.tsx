import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { ImportWizard } from "@/components/import/import-wizard";

export const metadata = { title: "Import CSV — InvestIQ AI" };

// The CSV import wizard (UI spec §3.3). The page itself stays thin: parsing
// and mapping happen in the browser, and every database step goes through the
// existing session-scoped server actions (validateImportRows dry run first,
// then the all-or-nothing importTransactions).
export default async function ImportPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Import CSV</h1>
      <ImportWizard />
    </>
  );
}
