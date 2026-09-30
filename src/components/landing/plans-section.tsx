// Plans: Free and Pro, on the public landing page (go-public-ui.md §1.6).
// Built only from buildPlansSection (which reads PLAN_FEATURES, PRICING and
// PLAN_LIMITS). There is no purchase button here in any state: checkout needs
// an account, so Pro is only ever bought from Settings.
import Link from "next/link";
import { Check, CircleDashed } from "lucide-react";

import type { SignUpStatus } from "@/lib/auth";
import { Reveal } from "@/components/landing/reveal";
import {
  COMING_LATER_BADGE,
  buildPlansSection,
  type PlanCardModel,
} from "@/components/landing/landing-copy";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function PlansSection({
  billingEnabled,
  signUpStatus,
}: {
  billingEnabled: boolean;
  signUpStatus: SignUpStatus;
}) {
  const model = buildPlansSection({ billingEnabled, signUpStatus });

  return (
    <section
      id="plans"
      aria-labelledby="plans-heading"
      className="scroll-mt-14 border-t border-slate-200 dark:border-slate-800"
    >
      <div className="mx-auto max-w-5xl px-6 py-20 sm:py-24">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2
              id="plans-heading"
              className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl"
            >
              {model.heading}
            </h2>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{model.subLine}</p>
          </div>
        </Reveal>

        <div className="mt-10 grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
          {model.cards.map((card, index) => (
            <Reveal key={card.plan} delay={index * 100} className="h-full">
              <PlanCard card={card} />
            </Reveal>
          ))}
        </div>

        <div className="mt-8 space-y-2 text-center text-sm text-slate-500 dark:text-slate-400">
          {model.footnotes.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanCard({ card }: { card: PlanCardModel }) {
  return (
    <div
      data-plan={card.plan}
      className={cn(
        "flex h-full w-full flex-col rounded-lg bg-white p-5 dark:bg-slate-950",
        card.emphasised
          ? "border-2 border-blue-600 dark:border-blue-500"
          : "border border-slate-200 dark:border-slate-800",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold">{card.name}</h3>
        {card.tag ? <Badge variant="secondary">{card.tag}</Badge> : null}
      </div>

      <div className="mt-4">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-semibold">{card.price}</span>
          {card.priceSuffix ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {card.priceSuffix}
            </span>
          ) : null}
          {card.plan === "FREE" ? (
            <span className="text-xs text-slate-500 dark:text-slate-400">{card.priceNote}</span>
          ) : null}
        </p>
        {card.plan !== "FREE" ? (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{card.priceNote}</p>
        ) : null}
      </div>

      {card.leadLine ? <p className="mt-4 text-sm font-medium">{card.leadLine}</p> : null}

      <ul className={cn("space-y-2 text-sm", card.leadLine ? "mt-2" : "mt-4")}>
        {card.features.map((feature) => (
          <li key={feature.key} className="flex items-start gap-2">
            {feature.comingLater ? (
              <CircleDashed
                className="mt-0.5 size-4 shrink-0 text-slate-500 dark:text-slate-400"
                aria-hidden="true"
              />
            ) : (
              <Check
                className="mt-0.5 size-4 shrink-0 text-slate-600 dark:text-slate-400"
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                "min-w-0 flex-1",
                feature.comingLater && "text-slate-500 dark:text-slate-400",
              )}
            >
              {feature.label}
            </span>
            {feature.comingLater ? (
              <Badge variant="outline" className="font-normal">
                {COMING_LATER_BADGE}
              </Badge>
            ) : null}
          </li>
        ))}
      </ul>

      {/* Pinned to the bottom so both cards line up on a laptop. */}
      <div className="mt-auto pt-6">
        {card.action.kind === "sign-up-button" ? (
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href={card.action.href}>{card.action.label}</Link>
          </Button>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">{card.action.text}</p>
        )}
      </div>
    </div>
  );
}
