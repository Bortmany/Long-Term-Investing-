// The auth route wrapper (src/app/api/auth/[...all]/route.ts), go-public
// spec A8 and the rate-limit table: paused sign-ups are refused on the
// SERVER (not just hidden), the 6th sign-up from one caller in an hour and
// the 6th resend / reset request for one address in an hour get the plain
// 429, and the screens are told honestly whether an email went out.
//
// Better Auth itself is replaced by a stub handler so no database is needed.

import { beforeEach, describe, expect, it, vi } from "vitest";

type SignUpStatus = { open: true } | { open: false; reason: "paused" | "email_unavailable" };

let signUpStatus: SignUpStatus = { open: true };
let callerId = "caller-default";
const handler = vi.fn<(request: Request) => Promise<Response>>();

vi.mock("@/lib/auth", () => ({
  auth: { handler: (request: Request) => handler(request) },
  getSignUpStatus: () => signUpStatus,
}));
vi.mock("@/lib/anon-rate-id", () => ({
  anonymousRateLimitId: async () => callerId,
}));

import { POST } from "@/app/api/auth/[...all]/route";
import { authEmailStore } from "@/lib/email/auth-emails";

let seq = 0;
const unique = (label: string) => `${label}-${++seq}-${Date.now()}`;

function post(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost:3000/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  signUpStatus = { open: true };
  callerId = unique("caller");
  handler.mockReset();
  handler.mockImplementation(async () => Response.json({ status: true }));
});

describe("sign-up gate", () => {
  it("paused → 403 on the server, Better Auth never runs", async () => {
    signUpStatus = { open: false, reason: "paused" };
    const res = await POST(post("/sign-up/email", { email: "ahmed@example.com", password: "x", name: "A" }));
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("SIGNUPS_PAUSED");
    expect(handler).not.toHaveBeenCalled();
  });

  it("email unavailable in production → 403 with the unavailable wording", async () => {
    signUpStatus = { open: false, reason: "email_unavailable" };
    const res = await POST(post("/sign-up/email", { email: "ahmed@example.com", password: "x", name: "A" }));
    const body = await res.json();
    expect(res.status).toBe(403);
    expect(body.code).toBe("SIGNUPS_UNAVAILABLE");
    expect(body.message).toContain("can't send confirmation emails");
  });

  it("paused does not block sign-in", async () => {
    signUpStatus = { open: false, reason: "paused" };
    const res = await POST(post("/sign-in/email", { email: "ahmed@example.com", password: "x" }));
    expect(res.status).toBe(200);
  });

  it("the 6th sign-up in an hour from one caller gets the plain 429", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await POST(
        post("/sign-up/email", { email: `${unique("u")}@example.com`, password: "x", name: "A" }),
      );
      expect(res.status).toBe(200);
    }
    const sixth = await POST(
      post("/sign-up/email", { email: `${unique("u")}@example.com`, password: "x", name: "A" }),
    );
    expect(sixth.status).toBe(429);
    expect(sixth.headers.get("Retry-After")).toBeTruthy();
    const body = await sixth.json();
    expect(body.code).toBe("RATE_LIMITED");
    expect(body.retryAfterSeconds).toBeGreaterThan(60);
  });
});

describe("hourly per-address email limit", () => {
  for (const path of ["/send-verification-email", "/request-password-reset"]) {
    it(`${path}: the 6th request for one address is refused, even from new callers`, async () => {
      const email = `${unique("inbox")}@example.com`;
      for (let i = 0; i < 5; i++) {
        callerId = unique("caller");
        expect((await POST(post(path, { email }))).status).toBe(200);
      }
      callerId = unique("caller");
      const sixth = await POST(post(path, { email }));
      expect(sixth.status).toBe(429);
      expect((await sixth.json()).code).toBe("EMAIL_SEND_LIMITED");
    });
  }

  it("the old forget-password name shares the same bucket", async () => {
    const email = `${unique("inbox")}@example.com`;
    for (let i = 0; i < 5; i++) {
      callerId = unique("caller");
      await POST(post("/request-password-reset", { email }));
    }
    callerId = unique("caller");
    expect((await POST(post("/forget-password", { email }))).status).toBe(429);
  });
});

describe("honest email delivery reporting", () => {
  it("sign-up that needs confirmation reports whether the email went out", async () => {
    handler.mockImplementation(async () => {
      const store = authEmailStore.getStore();
      if (store) store.outcome = "failed";
      return Response.json({ token: null, user: { id: "u1" } });
    });
    const res = await POST(post("/sign-up/email", { email: "ahmed@example.com", password: "x", name: "A" }));
    expect(res.status).toBe(200);
    expect((await res.json()).emailDelivery).toBe("failed");
  });

  it("sign-up with no email attempt at all never claims it was sent", async () => {
    handler.mockImplementation(async () => Response.json({ token: null, user: { id: "u1" } }));
    const res = await POST(post("/sign-up/email", { email: "ahmed@example.com", password: "x", name: "A" }));
    expect((await res.json()).emailDelivery).toBe("failed");
  });

  it("sign-up that signed the person straight in (no email set up) says not_needed", async () => {
    handler.mockImplementation(async () => Response.json({ token: "session-token", user: { id: "u1" } }));
    const res = await POST(post("/sign-up/email", { email: "ahmed@example.com", password: "x", name: "A" }));
    expect((await res.json()).emailDelivery).toBe("not_needed");
  });

  it("resend that failed to send answers 503, never a cheerful 200", async () => {
    handler.mockImplementation(async () => {
      const store = authEmailStore.getStore();
      if (store) store.outcome = "failed";
      return Response.json({ status: true });
    });
    const res = await POST(post("/send-verification-email", { email: `${unique("x")}@example.com` }));
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("EMAIL_SEND_FAILED");
  });

  it("reset request always gives the same answer, even when the send failed", async () => {
    handler.mockImplementation(async () => {
      const store = authEmailStore.getStore();
      if (store) store.outcome = "failed";
      return Response.json({ status: true });
    });
    const res = await POST(post("/request-password-reset", { email: `${unique("x")}@example.com` }));
    expect(res.status).toBe(200);
  });

  it("right password but unconfirmed: sign-in says whether the new link went out, and isn't counted as a wrong guess", async () => {
    const email = `${unique("unconfirmed")}@example.com`;
    handler.mockImplementation(async () => {
      const store = authEmailStore.getStore();
      if (store) store.outcome = "sent";
      return Response.json({ code: "EMAIL_NOT_VERIFIED", message: "Email not verified" }, { status: 403 });
    });
    for (let i = 0; i < 12; i++) {
      callerId = unique("caller");
      const res = await POST(post("/sign-in/email", { email, password: "right" }));
      expect(res.status).toBe(403);
      expect((await res.json()).emailDelivery).toBe("sent");
    }
  });
});
