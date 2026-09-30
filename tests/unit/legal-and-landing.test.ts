// Go public safely, chunk C: the landing page and the legal pages stay honest.
// - The old private-beta wording is gone from the whole app.
// - The landing page never uses Buy/Sell/Hold verdict words and says what
//   InvestIQ is ("portfolio tracking and research software, not personalised advice").
// - While billing is off, nothing claims Pro is on sale (landing + terms), and
//   there is never a purchase button on the landing page.
// - The refund line on /terms matches the owner's decision word for word.
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { isBillingEnabled } from "@/lib/billing/config";
import { PLAN_FEATURES, PRICING } from "@/lib/plans";
import {
  COMING_SOON_TAG,
  POSITIONING_LINE,
  PRO_NOT_ON_SALE_LINE,
  SIGNUPS_PAUSED_LINE,
  buildPlansSection,
  featureRowsFor,
  formatUsd,
  readBillingEnabledSafely,
  readSignUpStatusSafely,
} from "@/components/landing/landing-copy";
import {
  PRO_NOT_ON_SALE_TERMS,
  PRO_ON_SALE_TERMS,
  REFUND_LINE,
  termsPaymentStatusSentence,
} from "@/components/landing/legal-copy";

const ROOT = path.resolve(__dirname, "../..");
const read = (relative: string) => readFileSync(path.join(ROOT, relative), "utf8");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx?|jsx?|mdx?|css)$/.test(name) ? [full] : [];
  });
}

// A test-mode billing environment (fake values; never real keys).
const BILLING_ON_ENV = {
  BILLING_ENABLED: "true",
  STRIPE_SECRET_KEY: "sk_test_unit",
  STRIPE_WEBHOOK_SECRET: "whsec_unit",
  STRIPE_PRICE_PRO_MONTHLY: "price_unit_month",
  STRIPE_PRICE_PRO_YEARLY: "price_unit_year",
  NODE_ENV: "test",
};

describe("old private-beta wording", () => {
  it("appears nowhere under src/", () => {
    const banned = /private beta|invitation-only|by invitation|private companion/i;
    const offenders = sourceFiles(path.join(ROOT, "src")).filter((file) =>
      banned.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((f) => path.relative(ROOT, f))).toEqual([]);
  });
});

describe("landing page wording", () => {
  const landingSources = [
    "src/app/page.tsx",
    ...readdirSync(path.join(ROOT, "src/components/landing")).map(
      (name) => `src/components/landing/${name}`,
    ),
  ]
    // legal-copy.ts holds the /terms sentences (which quote "Manage billing"
    // etc.), not landing text.
    .filter((file) => !file.endsWith("legal-copy.ts"));

  it("has no Buy / Sell / Hold verdict language", () => {
    const verdict = /\b(buy|buys|sell|sells|hold|holds)\b/i;
    for (const file of landingSources) {
      expect(verdict.test(read(file)), file).toBe(false);
    }
    // The plan feature labels are shown on the page too.
    for (const feature of PLAN_FEATURES) {
      expect(verdict.test(feature.label), feature.label).toBe(false);
    }
  });

  it("states the positioning sentence, and the page and metadata use it", () => {
    expect(POSITIONING_LINE.toLowerCase()).toContain(
      "portfolio tracking and research software, not personalised advice",
    );
    const page = read("src/app/page.tsx");
    expect(page).toContain("{POSITIONING_LINE}");
    expect(page).toMatch(/description: `\$\{POSITIONING_LINE\}/);
    expect(read("src/components/landing/landing-footer.tsx")).toContain("{POSITIONING_LINE}");
  });

  it("keeps the signed-in redirect, the AI disclaimer component and the plans section", () => {
    const page = read("src/app/page.tsx");
    expect(page).toContain('redirect("/dashboard")');
    expect(page).toContain("<AiDisclaimer />");
    expect(page).toContain("<PlansSection");
    expect(page).toContain("getSignUpStatus");
    expect(read("src/components/landing/plans-section.tsx")).toContain('id="plans"');
  });

  it("falls back to the paused version when sign-up status can't be read", () => {
    const status = readSignUpStatusSafely(() => {
      throw new Error("boom");
    });
    expect(status.open).toBe(false);
    expect(readBillingEnabledSafely(() => {
      throw new Error("boom");
    })).toBe(false);
  });
});

describe("plans section", () => {
  const open = { open: true } as const;
  const paused = { open: false, reason: "paused" } as const;

  it("while billing is OFF: Pro says Coming soon, has no purchase button, thin frame", () => {
    const model = buildPlansSection({ billingEnabled: false, signUpStatus: open });
    const [free, pro] = model.cards;
    expect(model.heading).toBe("Start free. Pro is coming soon.");
    expect(model.subLine).toBe("Pro isn't on sale yet. Everything in Free works today.");
    expect(pro.tag).toBe(COMING_SOON_TAG);
    expect(pro.action).toEqual({ kind: "line", text: PRO_NOT_ON_SALE_LINE });
    expect(pro.emphasised).toBe(false);
    // The only button anywhere in the section is Free's "Create free account".
    expect(free.action).toEqual({
      kind: "sign-up-button",
      label: "Create free account",
      href: "/sign-up",
    });
    const all = JSON.stringify(model);
    expect(all).not.toMatch(/checkout|upgrade now|buy/i);
  });

  it("while billing is ON: no tag, and still no purchase button (upgrade happens in Settings)", () => {
    const model = buildPlansSection({ billingEnabled: true, signUpStatus: open });
    const pro = model.cards[1];
    expect(model.heading).toBe("Start free. Upgrade when you're ready.");
    expect(pro.tag).toBeNull();
    expect(pro.action).toEqual({
      kind: "line",
      text: "Create a free account first, then upgrade in Settings.",
    });
  });

  it("paused sign-ups replace the Free button with the paused line", () => {
    const model = buildPlansSection({ billingEnabled: false, signUpStatus: paused });
    expect(model.cards[0].action).toEqual({ kind: "line", text: SIGNUPS_PAUSED_LINE });
  });

  it("prices and features come from PRICING and PLAN_FEATURES", () => {
    const [free, pro] = buildPlansSection({ billingEnabled: false, signUpStatus: open }).cards;
    expect(free.price).toBe("$0");
    expect(pro.price).toBe(formatUsd(PRICING.proMonthlyUsd));
    expect(pro.price).toBe("$9.99");
    expect(pro.priceNote).toBe("or $89 / year (about 26% less)");
    expect(free.features.map((f) => f.key).sort()).toEqual(
      PLAN_FEATURES.filter((f) => f.plan === "FREE").map((f) => f.key).sort(),
    );
    expect(pro.features.map((f) => f.key).sort()).toEqual(
      PLAN_FEATURES.filter((f) => f.plan === "PRO").map((f) => f.key).sort(),
    );
    // Coming-soon features are marked, never shown as available.
    for (const row of [...featureRowsFor("FREE"), ...featureRowsFor("PRO")]) {
      const source = PLAN_FEATURES.find((f) => f.key === row.key)!;
      expect(row.comingLater).toBe(source.status === "coming_soon");
    }
  });
});

describe("/terms", () => {
  it("the payment-status sentence follows the live billing flag (both states)", () => {
    expect(isBillingEnabled({})).toBe(false);
    expect(termsPaymentStatusSentence(isBillingEnabled({}))).toBe(
      "Pro is not on sale yet. When it opens, the terms below apply.",
    );
    expect(isBillingEnabled(BILLING_ON_ENV)).toBe(true);
    expect(termsPaymentStatusSentence(isBillingEnabled(BILLING_ON_ENV))).toBe(
      "These terms apply to Pro.",
    );
    expect(PRO_NOT_ON_SALE_TERMS).not.toBe(PRO_ON_SALE_TERMS);
  });

  it("the terms and privacy pages read the flag per request, not at build time", () => {
    for (const file of ["src/app/terms/page.tsx", "src/app/privacy/page.tsx"]) {
      const source = read(file);
      expect(source, file).toContain("await connection()");
      expect(source.indexOf("await connection()"), file).toBeLessThan(
        source.indexOf("isBillingEnabled()"),
      );
    }
    expect(read("src/app/terms/page.tsx")).toContain(
      "termsPaymentStatusSentence(billingEnabled)",
    );
  });

  it("the refund line matches docs/decisions/usd-payments.md word for word", () => {
    const decision = read("docs/decisions/usd-payments.md");
    const match = decision.match(/\*\*Refund line for the terms:\*\* "(.+)"\s*$/m);
    expect(match).not.toBeNull();
    expect(REFUND_LINE).toBe(match![1]);
    expect(read("src/app/terms/page.tsx")).toContain("{REFUND_LINE}");
  });

  it("keeps the Not financial advice section and adds the positioning sentence", () => {
    const terms = read("src/app/terms/page.tsx");
    expect(terms).toContain("recommendation to buy, sell, or hold anything");
    expect(terms).toContain("{TERMS_POSITIONING_SENTENCE}");
  });
});

describe("/privacy", () => {
  it("describes the new stored items and services", () => {
    // Collapse line breaks so a sentence wrapped across source lines still matches.
    const privacy = read("src/app/privacy/page.tsx").replace(/\s+/g, " ");
    for (const phrase of [
      "Your plan:",
      "Billing details",
      "never reach or get stored by InvestIQ",
      "Email confirmation:",
      "iq_anon",
      "<strong>Stripe</strong>",
      "reset your password",
      "cancelled first",
      "upside/downside checks",
    ]) {
      expect(privacy, phrase).toContain(phrase);
    }
    expect(privacy).not.toMatch(/buy\/sell analyses/);
  });
});
