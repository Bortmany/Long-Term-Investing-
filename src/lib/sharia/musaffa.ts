// Musaffa adapter: the ONLY file that reads MUSAFFA_API_KEY.
//
// DORMANT BY DEFAULT: with no key `getMusaffaVendor()` returns null and no
// request is ever made.
//
// !! UNVERIFIED AGAINST THE REAL API !!  Nobody on this project has Musaffa's
// documentation or a key yet. Everything marked UNVERIFIED below (the address
// and path, the auth header name, the exchange codes, the reply field names,
// the status words and the date format) is a stand-in written to the decision
// note's field list and checked ONLY against fake replies in tests. Before the
// key goes on the live site the owner (or a builder with the docs) checks each
// one against Musaffa's published API docs / sandbox. See GO-LIVE.md.
//
// GOLDEN RULE: a reply becomes a verdict only when ALL are true: the body is
// the expected shape, the status word is one we map explicitly, the reply
// names its method, and it carries a usable data date. Anything else is "no
// verdict" or "unavailable", never a guess.
//
// SECRETS: the key travels in a request header, never in the address, is
// never logged and never appears in any returned value. Errors are reduced to
// fixed reason codes: no request address, reply text or thrown-error text
// is kept.

import { logger } from "@/lib/logger";
import type { ShariaVendor, VendorInstrument, VendorResult } from "./vendor";

// UNVERIFIED AGAINST THE REAL API: default address.
const DEFAULT_BASE_URL = "https://api.musaffa.com";
const REQUEST_TIMEOUT_MS = 10_000;

// UNVERIFIED AGAINST THE REAL API: how each of our markets is named to Musaffa.
const EXCHANGE_CODES: Record<string, string> = {
  US: "US",
  TADAWUL: "TADAWUL",
  DFM: "DFM",
  ADX: "ADX",
};

// UNVERIFIED AGAINST THE REAL API: the supplier's status words, lower-cased
// with spaces and dashes turned into underscores. Anything not listed
// (including any middle category such as "questionable") is NOT a verdict.
const COMPLIANT_WORDS = new Set(["compliant", "halal"]);
const NOT_COMPLIANT_WORDS = new Set(["not_compliant", "non_compliant", "noncompliant", "haram"]);
// Words that clearly mean "we have nothing", counted as no verdict (not "unmapped").
const NO_DATA_WORDS = new Set(["not_covered", "no_data", "not_available", "unknown", "not_screened"]);

function normalizeWord(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
}

/** Max size of the stored ratios object, so a strange reply cannot bloat the table. */
const MAX_RATIOS = 20;

function readRatios(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(out).length >= MAX_RATIOS) break;
    if (!/^[A-Za-z0-9_]{1,40}$/.test(key)) continue;
    if (typeof raw === "number" && Number.isFinite(raw)) out[key] = raw;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** UNVERIFIED AGAINST THE REAL API: a plain date or an ISO date-time. */
function readAsOf(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}([T ][0-9:.]+Z?)?$/.test(text)) return null;
  const date = new Date(text.length === 10 ? `${text}T00:00:00Z` : text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

/**
 * Turn a parsed reply into a result. Exported for the tests. UNVERIFIED
 * AGAINST THE REAL API: every field name read here.
 */
export function mapMusaffaReply(body: unknown): VendorResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { kind: "unavailable", reason: "error" };
  const reply = body as Record<string, unknown>;

  const word = normalizeWord(reply.status ?? reply.compliance_status);
  if (NO_DATA_WORDS.has(word)) return { kind: "no_verdict" };
  const verdict = COMPLIANT_WORDS.has(word)
    ? "COMPLIANT"
    : NOT_COMPLIANT_WORDS.has(word)
      ? "NOT_COMPLIANT"
      : null;
  if (!verdict) {
    // Missing or unrecognised status (including a "questionable" category).
    return word === "" ? { kind: "unavailable", reason: "error" } : { kind: "no_verdict", unmappedStatus: true };
  }

  // UNVERIFIED AGAINST THE REAL API: method fields. The default "AAOIFI-based
  // method" is NOT used: the docs are not confirmed, so a reply with no method
  // name is not a verdict (we would be guessing the method).
  const method = (reply.methodology ?? reply.method) as Record<string, unknown> | string | undefined;
  const methodName =
    typeof method === "string" ? text(method, 80) : text(method?.name, 80);
  const methodVersion =
    typeof method === "object" && method ? text(method.version, 20) : text(reply.methodology_version, 20);
  const asOf = readAsOf(reply.as_of ?? reply.report_date);
  if (!methodName || !asOf) return { kind: "no_verdict" };

  return {
    kind: "verdict",
    verdict,
    methodName,
    methodVersion,
    ratios: readRatios(reply.ratios),
    asOf,
  };
}

export type MusaffaOptions = {
  apiKey: string;
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

export function createMusaffaVendor(options: MusaffaOptions): ShariaVendor {
  const fetchFn = options.fetchFn ?? fetch;
  const base = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  return {
    id: "musaffa",
    displayName: "Musaffa",
    async fetchVerdict(instrument: VendorInstrument): Promise<VendorResult> {
      const exchange = EXCHANGE_CODES[instrument.market];
      // Never ask about an exchange we have no code for.
      if (!exchange) return { kind: "no_verdict" };
      const ticker = instrument.ticker.trim().toUpperCase();
      if (!/^[A-Z0-9.\-]{1,20}$/.test(ticker)) return { kind: "no_verdict" };

      // UNVERIFIED AGAINST THE REAL API: path and query names.
      const url = `${base}/v1/screening?symbol=${encodeURIComponent(ticker)}&exchange=${encodeURIComponent(exchange)}`;
      try {
        const response = await fetchFn(url, {
          method: "GET",
          // UNVERIFIED AGAINST THE REAL API: header name for the key.
          headers: { "x-api-key": options.apiKey, accept: "application/json" },
          signal: AbortSignal.timeout(timeoutMs),
          cache: "no-store",
        });
        if (response.status === 401 || response.status === 403) {
          return { kind: "unavailable", reason: "auth_failed" };
        }
        if (response.status === 429) return { kind: "unavailable", reason: "rate_limited" };
        if (response.status === 404) return { kind: "no_verdict" };
        if (!response.ok) return { kind: "unavailable", reason: "error" };
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          return { kind: "unavailable", reason: "error" };
        }
        return mapMusaffaReply(body);
      } catch {
        // Timeout or network failure. The thrown error is dropped on purpose:
        // its text could carry the request address.
        logger.warn("Sharia vendor call failed", { vendor: "musaffa" });
        return { kind: "unavailable", reason: "error" };
      }
    },
  };
}

/** The key, or null. The only place in the app that reads MUSAFFA_API_KEY. */
function readKey(env: Record<string, string | undefined>): string | null {
  const key = (env.MUSAFFA_API_KEY ?? "").trim();
  return key === "" ? null : key;
}

export function isMusaffaConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return readKey(env) !== null;
}

/** Only an https address is accepted for the optional sandbox override. */
function readBaseUrl(env: Record<string, string | undefined>): string | undefined {
  const raw = (env.MUSAFFA_API_BASE_URL ?? "").trim();
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" ? url.origin + url.pathname.replace(/\/+$/, "") : undefined;
  } catch {
    return undefined;
  }
}

/** The live adapter, or null when there is no key (dormant: no request is ever made). */
export function getMusaffaVendor(env: Record<string, string | undefined> = process.env): ShariaVendor | null {
  const apiKey = readKey(env);
  if (!apiKey) return null;
  return createMusaffaVendor({ apiKey, baseUrl: readBaseUrl(env) });
}
