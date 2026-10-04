// The Interactive Brokers Flex Web Service client: the only code that talks
// to IBKR. Two read-only calls, nothing else:
//   1. SendRequest  (token + query id)        -> a reference code
//   2. GetStatement (token + reference code)  -> the report
//
// SAFETY RULES (see docs/CONVENTIONS.md "Broker connection"):
//  - The two addresses below are constants. The address IBKR returns inside
//    its reply is IGNORED. IBKR_FLEX_BASE_URL (a local stand-in server for
//    tests) is honoured ONLY when NODE_ENV is not "production".
//  - The token travels in the web address (IBKR's design). So this file never
//    puts an address, query string or reply text into an error, a log line or
//    a return value. Failures become our own fixed sentences.
//  - Redirects are not followed; each call times out after 20 seconds; the
//    reply is read as a stream and abandoned beyond 10 MB.

import { logger } from "@/lib/logger";
import type {
  BrokerFailure,
  FetchedReport,
  FlexCredentials,
  ReferenceResult,
} from "../types";
import {
  STILL_GENERATING_CODE,
  mapIbkrError,
  networkFailure,
  unreadableFailure,
} from "./errors";

export const IBKR_FLEX_HOST = "https://ndcdyn.interactivebrokers.com";
export const SEND_REQUEST_PATH = "/AccountManagement/FlexWebService/SendRequest";
export const GET_STATEMENT_PATH = "/AccountManagement/FlexWebService/GetStatement";
export const FLEX_VERSION = "3";
export const USER_AGENT = "InvestIQ/1.0";

export const CALL_TIMEOUT_MS = 20_000;
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
/** Waits before each GetStatement attempt: first 3s, then 3, 6, 12, 20, 30. */
export const STATEMENT_WAITS_SECONDS = [3, 3, 6, 12, 20, 30] as const;
export const TOTAL_BUDGET_MS = 90_000;

export type FlexDeps = {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  env?: Record<string, string | undefined>;
};

let warnedBaseOverride = false;

/** The base address: IBKR's, unless a developer stand-in is allowed. */
export function resolveBaseUrl(env: Record<string, string | undefined> = process.env): string {
  const override = env.IBKR_FLEX_BASE_URL?.trim();
  if (!override) return IBKR_FLEX_HOST;
  if (env.NODE_ENV === "production") {
    if (!warnedBaseOverride) {
      warnedBaseOverride = true;
      logger.warn("IBKR_FLEX_BASE_URL is ignored in production.");
    }
    return IBKR_FLEX_HOST;
  }
  return override.replace(/\/+$/, "");
}

// --- tiny reply readers (case-insensitive tags, no general XML parsing) -----

function readTag(xml: string, name: string): string | null {
  const m = new RegExp(`<${name}\\b[^>]*>([^<]*)</${name}>`, "i").exec(xml);
  return m ? m[1].trim() : null;
}

function looksLikeFlexResponse(body: string): boolean {
  return /<FlexStatementResponse\b/i.test(body);
}

function parseFailureCode(body: string): number | null {
  const raw = readTag(body, "ErrorCode");
  if (raw === null || !/^\d{1,6}$/.test(raw)) return null;
  return Number(raw);
}

// --- one guarded call ---------------------------------------------------------

type CallResult = { ok: true; body: string } | { ok: false; failure: BrokerFailure };

async function readCapped(response: Response): Promise<string | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // already closed
      }
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function call(
  path: string,
  params: Record<string, string>,
  deps: FlexDeps,
): Promise<CallResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  try {
    const url = new URL(resolveBaseUrl(deps.env) + path);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("v", FLEX_VERSION);
    const response = await fetchImpl(url.toString(), {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": USER_AGENT, Accept: "application/xml,text/xml,*/*" },
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    // Redirects are never followed; anything but a plain 200 is a failure.
    if (response.status < 200 || response.status >= 300) {
      return { ok: false, failure: networkFailure() };
    }
    const body = await readCapped(response);
    if (body === null || body.trim() === "") {
      return { ok: false, failure: unreadableFailure() };
    }
    return { ok: true, body };
  } catch {
    // Deliberately no error text: it could carry the address (and the token).
    return { ok: false, failure: networkFailure() };
  }
}

// --- the two public calls --------------------------------------------------------

/** SendRequest: ask IBKR to prepare the report. Proves the token + query id. */
export async function sendRequest(
  creds: FlexCredentials,
  deps: FlexDeps = {},
): Promise<ReferenceResult> {
  const result = await call(SEND_REQUEST_PATH, { t: creds.token, q: creds.queryId }, deps);
  if (!result.ok) return result.failure;
  const body = result.body;
  if (!looksLikeFlexResponse(body)) return unreadableFailure();
  const status = readTag(body, "Status")?.toLowerCase();
  if (status === "success") {
    const reference = readTag(body, "ReferenceCode");
    // The reply's own <url> is ignored on purpose.
    if (reference && /^[A-Za-z0-9]{1,64}$/.test(reference)) {
      return { ok: true, referenceCode: reference };
    }
    return unreadableFailure();
  }
  if (status === "fail" || status === "warn") {
    return mapIbkrError(parseFailureCode(body));
  }
  return unreadableFailure();
}

/** One GetStatement attempt. `pending` means "still generating". */
async function getStatementOnce(
  creds: FlexCredentials,
  referenceCode: string,
  deps: FlexDeps,
): Promise<{ kind: "report"; body: string } | { kind: "pending" } | { kind: "failure"; failure: BrokerFailure }> {
  // IBKR's sample sends the reference code in "q" for GetStatement.
  const result = await call(GET_STATEMENT_PATH, { t: creds.token, q: referenceCode }, deps);
  if (!result.ok) return { kind: "failure", failure: result.failure };
  const body = result.body;
  if (/<FlexQueryResponse\b/i.test(body)) return { kind: "report", body };
  if (looksLikeFlexResponse(body)) {
    const status = readTag(body, "Status")?.toLowerCase();
    if (status === "fail" || status === "warn") {
      const code = parseFailureCode(body);
      if (code === STILL_GENERATING_CODE) return { kind: "pending" };
      return { kind: "failure", failure: mapIbkrError(code) };
    }
  }
  return { kind: "failure", failure: unreadableFailure() };
}

/**
 * GetStatement with the backoff for "still generating": wait 3s, ask; on
 * "still generating" wait 3, 6, 12, 20, 30 seconds (six asks), never past the
 * 90-second total. Any other failure stops straight away (no retry here).
 */
export async function getStatement(
  creds: FlexCredentials,
  referenceCode: string,
  deps: FlexDeps = {},
): Promise<FetchedReport> {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const started = now();
  for (let attempt = 0; attempt < STATEMENT_WAITS_SECONDS.length; attempt++) {
    const waitMs = STATEMENT_WAITS_SECONDS[attempt] * 1000;
    if (now() - started + waitMs > TOTAL_BUDGET_MS) break;
    await sleep(waitMs);
    const result = await getStatementOnce(creds, referenceCode, deps);
    if (result.kind === "report") return { ok: true, body: result.body };
    if (result.kind === "failure") return result.failure;
    // pending: loop and wait longer
  }
  return mapIbkrError(STILL_GENERATING_CODE);
}
