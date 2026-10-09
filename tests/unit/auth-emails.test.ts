// Account emails (go-public spec A7): names are HTML-escaped, links come from
// BETTER_AUTH_URL, production refuses to send a link that couldn't work, and
// every send records an HONEST outcome — never "sent" when it wasn't.

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  authEmailStore,
  buildExistingAccountEmail,
  buildResetEmail,
  buildResetLink,
  buildVerifyEmail,
  buildVerifyLink,
  emailLinkOrigin,
  sendAuthEmail,
  type AuthEmailStore,
} from "@/lib/email/auth-emails";

const HOSTILE_NAME = `<script>alert("x")</script> & 'co'`;

describe("email templates", () => {
  const input = {
    name: HOSTILE_NAME,
    url: "https://investiq.example/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email",
    contactEmail: "help@example.com",
  };

  for (const [label, build] of [
    ["confirm your email", buildVerifyEmail],
    ["reset your password", buildResetEmail],
    ["existing account", buildExistingAccountEmail],
  ] as const) {
    it(`${label}: escapes the name in the HTML body`, () => {
      const email = build(input);
      expect(email.html).not.toContain("<script>");
      expect(email.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;co&#39;");
      // The raw link appears (escaped) and the contact address is there.
      expect(email.html).toContain("token=abc&amp;callbackURL=%2Fverify-email");
      expect(email.html).toContain("help@example.com");
      expect(email.text).toContain(input.url);
      expect(email.text).toContain("help@example.com");
      // No tracking pixels.
      expect(email.html).not.toMatch(/<img/i);
    });
  }

  it("uses the fixed plain-English lines", () => {
    expect(buildVerifyEmail(input).text).toContain(
      "If you didn't create an account, you can ignore this email.",
    );
    expect(buildResetEmail(input).text).toContain(
      "If you didn't ask for this, ignore it. Your password hasn't changed.",
    );
  });

  it("links land on our own pages", () => {
    expect(buildVerifyLink("https://a.example", "t1")).toBe(
      "https://a.example/api/auth/verify-email?token=t1&callbackURL=%2Fverify-email%3Fconfirmed%3D1",
    );
    expect(buildResetLink("https://a.example", "t2")).toBe(
      "https://a.example/api/auth/reset-password/t2?callbackURL=%2Freset-password",
    );
  });
});

describe("emailLinkOrigin", () => {
  it("production: a real public address is used", () => {
    expect(
      emailLinkOrigin({ NODE_ENV: "production", BETTER_AUTH_URL: "https://investiq.example/" }),
    ).toBe("https://investiq.example");
  });

  it("production: missing, localhost, 127.0.0.1 or junk → null (don't send)", () => {
    expect(emailLinkOrigin({ NODE_ENV: "production" }, "https://from-request.example")).toBeNull();
    expect(emailLinkOrigin({ NODE_ENV: "production", BETTER_AUTH_URL: "http://localhost:3000" })).toBeNull();
    expect(emailLinkOrigin({ NODE_ENV: "production", BETTER_AUTH_URL: "http://127.0.0.1:3000" })).toBeNull();
    expect(emailLinkOrigin({ NODE_ENV: "production", BETTER_AUTH_URL: "not a url" })).toBeNull();
  });

  it("development: localhost is fine, and falls back to the request's address", () => {
    expect(emailLinkOrigin({ NODE_ENV: "development", BETTER_AUTH_URL: "http://localhost:3000" })).toBe(
      "http://localhost:3000",
    );
    expect(emailLinkOrigin({ NODE_ENV: "development" }, "http://localhost:3101/api/auth/x")).toBe(
      "http://localhost:3101",
    );
  });
});

describe("sendAuthEmail records an honest outcome", () => {
  let counter = 0;
  const freshAddress = () => `person${++counter}-${Date.now()}@example.com`;
  const ok = vi.fn(async () => ({ ok: true as const, data: { id: "msg_1" } }));

  beforeEach(() => ok.mockClear());

  it("production without a usable BETTER_AUTH_URL does NOT send, and says failed", async () => {
    const store: AuthEmailStore = { emailSendCounted: false };
    const outcome = await authEmailStore.run(store, () =>
      sendAuthEmail(
        { kind: "verify", to: freshAddress(), name: "Ahmed", token: "t" },
        { env: { NODE_ENV: "production", BETTER_AUTH_URL: "http://localhost:3000" }, sendEmailFn: ok },
      ),
    );
    expect(outcome).toBe("failed");
    expect(store.outcome).toBe("failed");
    expect(ok).not.toHaveBeenCalled();
  });

  it("production with a public BETTER_AUTH_URL sends, with that address in the link", async () => {
    const store: AuthEmailStore = { emailSendCounted: false };
    const outcome = await authEmailStore.run(store, () =>
      sendAuthEmail(
        { kind: "reset", to: freshAddress(), name: "Ahmed", token: "tok" },
        { env: { NODE_ENV: "production", BETTER_AUTH_URL: "https://investiq.example" }, sendEmailFn: ok },
      ),
    );
    expect(outcome).toBe("sent");
    expect(store.outcome).toBe("sent");
    const sent = (ok.mock.calls[0] as unknown as [{ text: string }])[0];
    expect(sent.text).toContain("https://investiq.example/api/auth/reset-password/tok");
  });

  it("a provider failure (or no email set up) is recorded as failed", async () => {
    const store: AuthEmailStore = { emailSendCounted: false };
    const down = vi.fn(async () => ({ ok: false as const, unavailable: "provider_error" as const }));
    await authEmailStore.run(store, () =>
      sendAuthEmail(
        { kind: "verify", to: freshAddress(), name: "Ahmed", token: "t" },
        { env: { NODE_ENV: "development", BETTER_AUTH_URL: "http://localhost:3000" }, sendEmailFn: down },
      ),
    );
    expect(store.outcome).toBe("failed");
  });

  it("the 6th sign-up/sign-in email to one address in an hour is not sent", async () => {
    const to = freshAddress();
    const env = { NODE_ENV: "development", BETTER_AUTH_URL: "http://localhost:3000" };
    for (let i = 0; i < 5; i++) {
      expect(await sendAuthEmail({ kind: "verify", to, name: "A", token: "t" }, { env, sendEmailFn: ok })).toBe("sent");
    }
    expect(await sendAuthEmail({ kind: "verify", to, name: "A", token: "t" }, { env, sendEmailFn: ok })).toBe(
      "rate_limited",
    );
    expect(ok).toHaveBeenCalledTimes(5);
  });

  it("does not count twice when the route wrapper already counted the request", async () => {
    const to = freshAddress();
    const env = { NODE_ENV: "development", BETTER_AUTH_URL: "http://localhost:3000" };
    for (let i = 0; i < 8; i++) {
      const store: AuthEmailStore = { emailSendCounted: true };
      await authEmailStore.run(store, () =>
        sendAuthEmail({ kind: "reset", to, name: "A", token: "t" }, { env, sendEmailFn: ok }),
      );
      expect(store.outcome).toBe("sent");
    }
  });
});
