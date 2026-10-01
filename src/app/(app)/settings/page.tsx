import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Currency } from "@prisma/client";

import { auth } from "@/lib/auth";
import { getLegalContactEmail } from "@/lib/legal-contact";
import { loadPlansCardData } from "@/lib/billing/plans-card-data";
import { PlansCard } from "@/components/settings/plans-card";
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

// Settings (UI spec §3.4): base currency, FX rates, appearance, Plans &
// billing (go-public-ui.md §3), your data and danger zone. Server component —
// it learns ONLY whether an FMP key exists (a boolean); the key value itself
// never reaches the client, and no Stripe key ever does either.
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ billing?: string }>;
}) {
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

  // The shared cache (FMP / SEED) plus THIS user's own manual rates. The
  // shared table is read-only from here (written only by the FMP refresh /
  // seed paths); a user can only add/delete their OWN manual rates, which live
  // in the user-scoped ManualFxRate table — see docs/CONVENTIONS.md.
  const [sharedFxRows, manualFxRows] = await Promise.all([
    prisma.fxRate.findMany({
      orderBy: [{ base: "asc" }, { quote: "asc" }, { asOf: "desc" }],
    }),
    prisma.manualFxRate.findMany({
      where: { userId: session.user.id },
      orderBy: [{ base: "asc" }, { quote: "asc" }, { asOf: "desc" }],
    }),
  ]);

  // Decimal → number at the edge, plus the per-row source badge computed here
  // so the client component gets plain display data. Only the user's own
  // manual rows carry a delete action.
  const rates: FxRateDisplayRow[] = [
    ...manualFxRows.map((row) => ({
      id: row.id,
      base: row.base,
      quote: row.quote,
      rate: row.rate.toNumber(),
      asOf: row.asOf,
      asOfLabel: formatShortDate(row.asOf),
      badge: badgePropsForValueSource({ kind: "manual" as const, asOf: row.asOf }),
      deletable: true,
    })),
    ...sharedFxRows.map((row) => ({
      id: row.id,
      ...fromPrismaFxRate(row),
      asOfLabel: formatShortDate(row.asOf),
      badge: badgePropsForValueSource({
        kind: badgeForPriceSource(row.source),
        asOf: row.asOf,
      }),
      deletable: false,
    })),
  ];

  // Boolean only — never the key itself.
  const hasFmpKey = Boolean(process.env.FMP_API_KEY);
  const currencies = Object.values(Currency);

  // Plan + AI usage for the Plans & billing card ({ ok: false } → the card's
  // error state, never a guessed number). ?billing= is only ever acted on
  // while billing is on, and it never grants Pro by itself.
  const plansData = await loadPlansCardData(session.user.id);
  const { billing } = await searchParams;
  const checkoutReturn = billing === "success" || billing === "cancelled" ? billing : null;

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold">Settings</h1>
      <div className="max-w-2xl space-y-6">
        <BaseCurrencyCard baseCurrency={baseCurrency} currencies={currencies} />

        {/* Anchor for the "Add an exchange rate" links on Dashboard/Portfolio. */}
        <div id="exchange-rates" className="scroll-mt-4">
          <FxRatesCard
            rates={rates}
            currencies={currencies}
            baseCurrency={baseCurrency}
            hasFmpKey={hasFmpKey}
          />
        </div>

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

        {/* Plans & billing — where the old "Account Access" card was. Usage
            comes from the same function that enforces the AI limits. */}
        <PlansCard
          data={plansData}
          checkoutReturn={checkoutReturn}
          contactEmail={getLegalContactEmail()}
        />

        <YourDataCard />

        <DangerCard />
      </div>
    </>
  );
}
