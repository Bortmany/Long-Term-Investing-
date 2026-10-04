// Interactive Brokers Flex error codes -> plain English.
//
// The codes and meanings are from IBKR's own Flex Web Service error list
// (checked 30 Sep 2026; there is no code 1002). A code that is not in the
// table gets the generic sentence plus "(IBKR code N)" so the owner can look
// it up. Whole sentences only, never glued fragments (a later translation
// replaces this one file).

import type { BrokerFailure, FailureKind } from "../types";

type Entry = { message: string; kind: FailureKind };

const BUSY_REPORT =
  "Interactive Brokers doesn't have your report ready. This often happens around market close or IBKR's nightly maintenance. Try again later.";

const TABLE: Record<number, Entry> = {
  1001: { kind: "retry", message: "Interactive Brokers couldn't generate your report just now. Try again shortly." },
  1003: { kind: "retry", message: BUSY_REPORT },
  1004: { kind: "retry", message: BUSY_REPORT },
  1005: { kind: "retry", message: BUSY_REPORT },
  1006: { kind: "retry", message: BUSY_REPORT },
  1007: { kind: "retry", message: BUSY_REPORT },
  1008: { kind: "retry", message: BUSY_REPORT },
  1009: { kind: "retry", message: "Interactive Brokers is busy right now. Try again in a few minutes." },
  1010: { kind: "fix", message: "That query is an old type IBKR no longer supports. Create a new Activity Flex Query." },
  1011: { kind: "fix", message: "Flex Web Service looks switched off for this IBKR account. Turn it on in IBKR's Flex settings." },
  1012: { kind: "reconnect", message: "Your IBKR token has expired. Create a new one in IBKR and reconnect." },
  1013: {
    kind: "reconnect",
    message:
      "Your token is locked to certain IP addresses and InvestIQ isn't one of them. In IBKR remove the IP restriction, create a new token and reconnect.",
  },
  1014: { kind: "fix", message: "IBKR doesn't recognise that Query ID. Check the number under Flex Queries." },
  1015: { kind: "reconnect", message: "IBKR doesn't recognise that token. Check you copied all of it, or create a new one." },
  1016: { kind: "reconnect", message: "IBKR says the account for this token isn't valid. Create a new token and reconnect." },
  1017: { kind: "retry", message: "Something went wrong fetching your report. Please try again." },
  1018: { kind: "retry", message: "Interactive Brokers asked us to slow down. Wait a minute and try again." },
  1019: { kind: "retry", message: "Interactive Brokers is still preparing your report. Try again in a few minutes." },
  1021: { kind: "retry", message: BUSY_REPORT },
};

export const NETWORK_MESSAGE = "We couldn't reach Interactive Brokers. Try again in a few minutes.";
export const UNREADABLE_MESSAGE = "Interactive Brokers sent something we couldn't read. Try again later.";
export const LAYOUT_MESSAGE =
  "Interactive Brokers sent a report in a layout we don't recognise. Nothing was added.";
export const KEY_UNREADABLE_MESSAGE =
  "We can't read your saved connection any more. Please reconnect.";

/** The code that means "still generating": the only one the client retries. */
export const STILL_GENERATING_CODE = 1019;

export function mapIbkrError(code: number | null): BrokerFailure {
  if (code !== null) {
    const entry = TABLE[code];
    if (entry) {
      return { ok: false, kind: entry.kind, code: `ibkr_${code}`, message: entry.message, ibkrCode: code };
    }
    return {
      ok: false,
      kind: "retry",
      code: `ibkr_${code}`,
      message: `Interactive Brokers couldn't process the request (IBKR code ${code}). Try again; if it keeps happening, contact us.`,
      ibkrCode: code,
    };
  }
  return unreadableFailure();
}

export function networkFailure(): BrokerFailure {
  return { ok: false, kind: "retry", code: "network", message: NETWORK_MESSAGE };
}

export function unreadableFailure(): BrokerFailure {
  return { ok: false, kind: "retry", code: "unreadable", message: UNREADABLE_MESSAGE };
}
