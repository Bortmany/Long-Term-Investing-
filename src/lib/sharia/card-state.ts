// What the Settings card needs, read on the server. Only yes/no answers reach
// the browser: never a key, never a plan detail beyond "is Pro".

import { prisma } from "@/lib/prisma";
import { isPro } from "@/lib/plan-access";
import { isBillingEnabled } from "@/lib/billing/config";
import { isShariaConfigured } from "./config";

export type ShariaCardState = {
  /** The saved preference (stays saved when someone stops being Pro). */
  enabled: boolean;
  isPro: boolean;
  /** True when the supplier key is set on this server. */
  configured: boolean;
  billingEnabled: boolean;
};

export async function loadShariaCardState(userId: string): Promise<ShariaCardState> {
  const [user, pro] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { shariaScreenEnabled: true } }),
    isPro(userId),
  ]);
  return {
    enabled: user?.shariaScreenEnabled ?? false,
    isPro: pro,
    configured: isShariaConfigured(),
    billingEnabled: isBillingEnabled(),
  };
}
