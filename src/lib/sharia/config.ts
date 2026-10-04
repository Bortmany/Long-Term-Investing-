// Which screening supplier is active, and whether it can be used at all.
// DORMANT BY DEFAULT: with no key (or an unknown SHARIA_VENDOR) screening is
// off, every badge says "Not screened" and no outside call is ever made.

import { getMusaffaVendor, isMusaffaConfigured } from "./musaffa";
import type { ShariaVendor } from "./vendor";

export const SUPPORTED_VENDORS = ["musaffa"] as const;
export type ShariaVendorId = (typeof SUPPORTED_VENDORS)[number];

/** The active supplier id, or null when SHARIA_VENDOR names one we don't have. */
export function activeVendorId(env: Record<string, string | undefined> = process.env): ShariaVendorId | null {
  const raw = (env.SHARIA_VENDOR ?? "").trim().toLowerCase();
  if (raw === "") return "musaffa";
  return (SUPPORTED_VENDORS as readonly string[]).includes(raw) ? (raw as ShariaVendorId) : null;
}

/** True only when the active supplier's key is set. Never reads or returns the key. */
export function isShariaConfigured(env: Record<string, string | undefined> = process.env): boolean {
  const vendor = activeVendorId(env);
  if (vendor === "musaffa") return isMusaffaConfigured(env);
  return false;
}

/** The supplier's display name ("Musaffa") for the detail sentence. */
export function vendorDisplayName(vendorId: string): string {
  return vendorId === "musaffa" ? "Musaffa" : vendorId;
}

/** The live adapter for the active supplier, or null when screening is off. */
export function getActiveVendor(env: Record<string, string | undefined> = process.env): ShariaVendor | null {
  return activeVendorId(env) === "musaffa" ? getMusaffaVendor(env) : null;
}
