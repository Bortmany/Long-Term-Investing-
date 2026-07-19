import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Currency } from "@prisma/client";

import { auth, signUpsAllowed } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { badgeForPriceSource } from "@/lib/data";
import { fromPrismaFxRate } from "@/lib/portfolio";
import { formatShortDate } from "@/lib/format";
import { badgePropsForValueSource } from "@/components/source-badge";
import { BaseCurrencyCard } from "@/components/settings/base-currency-card";
import { DangerCard } from "@/components/settings/danger-card";
import {
  FxRatesCard,
  type FxRateDisplayRow,
} from "@/components/settings/fx-rates-card";
import { YourDataCard } from "@/components/settings/your-data-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Settings — InvestIQ AI" };

// Settings (UI spec §3.4): base currency, FX rates, and two informational
// cards. Server component — it learns ONLY whether an FMP key exists (a
// boolean); the key value itself never reaches the client.
export default async function SettingsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }

  // The user's portfolio (oldest one is "the" portfolio, matching the server
  // actions). A brand-new account without one shows the same OMR default the
  // portfolio will be created with on first save.
  const portfolio = await prisma.portfolio.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "asc" },
  });
  const baseCurrency = portfolio?.baseCurrency ?? Currency.OMR;

  const fxRows = await prisma.fxRate.findMany({
    orderBy: [{ base: "asc" }, { quote: "asc" }, { asOf: "desc" }],
  });

  // Decimal → number at the edge (fromPrismaFxRate), plus the per-row source
  // badge computed here so the client component gets plain display data.
  const rates: FxRateDisplayRow[] = fxRows.map((row) => ({
    id: row.id,
    ...fromPrismaFxRate(row),
    asOfLabel: formatShortDate(row.asOf),
    badge: badgePropsForValueSource({
      kind: badgeForPriceSource(row.source),
      asOf: row.asOf,
    }),
  }));

  // Boolean only — never the key itself.
  const hasFmpKey = Boolean(process.env.FMP_API_KEY);
  const signUpsOpen = signUpsAllowed();
  const currencies = Object.values(Currency);

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <div className="max-w-2xl space-y-6">
        <BaseCurrencyCard baseCurrency={baseCurrency} currencies={currencies} />

        <FxRatesCard
          rates={rates}
          currencies={currencies}
          baseCurrency={baseCurrency}
          hasFmpKey={hasFmpKey}
        />

        {/* Appearance — informational only; the theme toggle lives in the
            sidebar and isn't duplicated here. */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Use the sun/moon icon in the sidebar to switch light and dark mode.
            </p>
          </CardContent>
        </Card>

        {/* Account Access — a neutral heads-up reflecting the ACTUAL state of
            the ALLOW_SIGNUPS gate, checked server-side per request. */}
        <Card>
          <CardHeader>
            <CardTitle>Account Access</CardTitle>
          </CardHeader>
          <CardContent>
            {signUpsOpen ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Sign-up is currently open to anyone who can reach this app
                (ALLOW_SIGNUPS is set to &quot;true&quot;). That&apos;s fine for
                local use. Before deploying this somewhere public, close
                sign-ups by removing ALLOW_SIGNUPS from the environment.
              </p>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Sign-up is currently closed — only existing accounts can sign
                in. That&apos;s the safe setting for any public deployment. To
                open it temporarily (for example while seeding a fresh
                database), set ALLOW_SIGNUPS to &quot;true&quot; in the
                environment.
              </p>
            )}
          </CardContent>
        </Card>

        <YourDataCard />

        <DangerCard />
      </div>
    </>
  );
}
