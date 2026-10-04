import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Currency } from "@prisma/client";

import { auth } from "@/lib/auth";
import { getLegalContactEmail } from "@/lib/legal-contact";
import { loadPlansCardData } from "@/lib/billing/plans-card-data";
import { PlansCard } from "@/components/settings/plans-card";
import { ShariaScreenCard } from "@/components/settings/sharia-screen-card";
import { loadShariaCardState } from "@/lib/sharia/card-state";
import { BrokerConnectionCard } from "@/components/settings/broker-connection-card";
import { loadBrokerCardState } from "@/lib/broker/card-state";
import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { badgeForPriceSource } from "@/lib/data";
import { findRateWithHub, fromPrismaFxRate } from "@/lib/portfolio";
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

  // Currencies the user holds or tracks that have NO usable rate into the base
  // currency (direct, inverse or through the rial). The rates card says so in
  // words instead of ever showing a made-up rate (golden rule).
  const [heldCurrencies, trackedCurrencies] = await Promise.all([
    portfolio
      ? prisma.transaction.findMany({
          where: { portfolioId: portfolio.id },
          select: { currency: true, instrument: { select: { currency: true } } },
          distinct: ["currency", "instrumentId"],
        })
      : Promise.resolve([]),
    prisma.watchlistItem.findMany({
      where: { userId: session.user.id },
      select: { instrument: { select: { currency: true } } },
    }),
  ]);
  const usedCurrencies = new Set<Currency>();
  for (const t of heldCurrencies) {
    usedCurrencies.add(t.currency);
    if (t.instrument) usedCurrencies.add(t.instrument.currency);
  }
  for (const w of trackedCurrencies) usedCurrencies.add(w.instrument.currency);
  const rateInputs = rates.map((r) => ({
    base: r.base,
    quote: r.quote,
    rate: r.rate,
    asOf: r.asOf,
  }));
  const missingRateCurrencies = Object.values(Currency).filter(
    (c) =>
      usedCurrencies.has(c) &&
      c !== baseCurrency &&
      findRateWithHub(c, baseCurrency, rateInputs) === null,
  );

  // Boolean only — never the key itself.
  const hasFmpKey = Boolean(process.env.FMP_API_KEY);
  const currencies = Object.values(Currency);

  // Plan + AI usage for the Plans & billing card ({ ok: false } → the card's
  // error state, never a guessed number). ?billing= is only ever acted on
  // while billing is on, and it never grants Pro by itself.
  const plansData = await loadPlansCardData(session.user.id);
  const { billing } = await searchParams;

  // Broker connection card state (read-only Interactive Brokers sync). A
  // read failure shows the card's own error state, never a guessed one.
  const brokerState = await loadBrokerCardState(session.user.id).catch((error: unknown) => {
    logger.error("Could not load the broker connection card", {
      errorName: error instanceof Error ? error.name : "unknown",
    });
    return null;
  });
  // Sharia screen card state (yes/no answers only; never the supplier key).
  const shariaState = await loadShariaCardState(session.user.id);
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
            missingRateCurrencies={missingRateCurrencies}
          />
        </div>

        <ShariaScreenCard state={shariaState} />

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

        {/* Broker connection — read-only Interactive Brokers sync (Step 4b). */}
        {brokerState ? (
          <BrokerConnectionCard state={brokerState} />
        ) : (
          <Card id="broker-connection">
            <CardHeader>
              <CardTitle>Broker connection</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                We couldn&apos;t load this just now. Refresh the page to try again.
              </p>
            </CardContent>
          </Card>
        )}

        <YourDataCard />

        <DangerCard />
      </div>
    </>
  );
}
