import { describe, expect, it } from "vitest";
import { stampSocketIpHeader } from "@/instrumentation-node";
import { SOCKET_IP_HEADER } from "@/lib/rate-limit";

// The pentest finding this covers: a cookie-less anonymous caller (curl, a
// bot) used to get a FRESH rate-limit bucket on every single request, making
// anonymous sign-in/sign-up/reset effectively unthrottled. The fix keys a
// cookie-less caller on the real TCP socket address instead — this test
// proves the piece that makes that value trustworthy: the diagnostics
// subscriber always overwrites SOCKET_IP_HEADER with the genuine socket
// address, discarding anything a caller sent under that same header name.

describe("stampSocketIpHeader — the real-socket-IP signal can't be spoofed", () => {
  it("stamps the socket's real remote address onto the header", () => {
    const headers: Record<string, string | string[] | undefined> = {};
    stampSocketIpHeader({
      request: { headers },
      socket: { remoteAddress: "203.0.113.9" },
    });
    expect(headers[SOCKET_IP_HEADER]).toBe("203.0.113.9");
  });

  it("OVERWRITES a value the caller already sent under the same header name", () => {
    const headers: Record<string, string | string[] | undefined> = {
      [SOCKET_IP_HEADER]: "1.2.3.4 (attacker-forged)",
    };
    stampSocketIpHeader({
      request: { headers },
      socket: { remoteAddress: "203.0.113.9" },
    });
    expect(headers[SOCKET_IP_HEADER]).toBe("203.0.113.9");
  });

  it("does nothing (never throws) when the message shape is missing pieces", () => {
    expect(() => stampSocketIpHeader({})).not.toThrow();
    expect(() => stampSocketIpHeader(null)).not.toThrow();
    expect(() =>
      stampSocketIpHeader({ request: { headers: {} }, socket: {} }),
    ).not.toThrow();
  });
});
