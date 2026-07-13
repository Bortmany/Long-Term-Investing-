import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { BaseCurrencyCard } from "@/components/settings/base-currency-card";
import {
  FxRatesCard,
  type FxRateRowData,
} from "@/components/settings/fx-rates-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Settings — InvestIQ AI" };

// Settings: base currency, FX rates, and two informational cards. All data
// is loaded server-side; the FX table converts Prisma Decimals to numbers at
// the edge before handing plain rows to the client components.
export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }

  // The base currency lives on the signed-in user's portfolio. A brand-new
  // account may not have one yet — setBaseCurrency creates it on first save,
  // so until then we show the same default that creation would use (OMR).
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  const baseCurrency = portfolio?.baseCurrency ?? "OMR";

  const fxRows = await prisma.fxRate.findMany({
    orderBy: [{ base: "asc" }, { quote: "asc" }, { asOf: "desc" }],
  });
  const rates: FxRateRowData[] = fxRows.map((row) => ({
    id: row.id,
    base: row.base,
    quote: row.quote,
    rate: row.rate.toNumber(),
    asOf: row.asOf,
    source: row.source,
  }));

  // Only whether a key exists crosses to the client — never the key itself.
  const hasFmpKey = Boolean(process.env.FMP_API_KEY);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <div className="space-y-6">
        <BaseCurrencyCard baseCurrency={baseCurrency} />
        <FxRatesCard rates={rates} hasFmpKey={hasFmpKey} />

        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Use the sun/moon icon in the sidebar to switch light and dark
              mode.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account Access</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Sign-up is currently open to anyone who visits this app.
              That&apos;s fine for local use. Before deploying this somewhere
              public, sign-up should be disabled or gated.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
