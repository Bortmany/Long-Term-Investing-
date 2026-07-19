import { describe, expect, it, vi } from "vitest";

import { escapeHtml, sendEmail } from "@/lib/email/send";

const SECRET_KEY = "re_super_secret_test_key_123";

function fakeFetch(response: { ok: boolean; status?: number; json?: unknown }) {
  return vi.fn(async () => ({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: async () => response.json ?? {},
  })) as unknown as typeof fetch;
}

describe("sendEmail — no key configured", () => {
  it("short-circuits with zero fetch calls and never touches the network", async () => {
    const fetchFn = vi.fn();
    const result = await sendEmail(
      { to: "owner@example.com", subject: "Hi", text: "Hi", html: "<p>Hi</p>" },
      { fetchFn: fetchFn as unknown as typeof fetch, apiKey: undefined, from: undefined },
    );
    expect(result).toEqual({ ok: false, unavailable: "no_api_key" });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("also short-circuits when only RESEND_FROM is missing", async () => {
    const fetchFn = vi.fn();
    const result = await sendEmail(
      { to: "owner@example.com", subject: "Hi", text: "Hi", html: "<p>Hi</p>" },
      { fetchFn: fetchFn as unknown as typeof fetch, apiKey: SECRET_KEY, from: undefined },
    );
    expect(result).toEqual({ ok: false, unavailable: "no_api_key" });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("sendEmail — provider errors", () => {
  it("a non-2xx response returns provider_error", async () => {
    const fetchFn = fakeFetch({ ok: false, status: 500 });
    const result = await sendEmail(
      { to: "owner@example.com", subject: "Hi", text: "Hi", html: "<p>Hi</p>" },
      { fetchFn, apiKey: SECRET_KEY, from: "InvestIQ <reviews@example.com>" },
    );
    expect(result).toEqual({ ok: false, unavailable: "provider_error" });
  });

  it("a network failure returns provider_error", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await sendEmail(
      { to: "owner@example.com", subject: "Hi", text: "Hi", html: "<p>Hi</p>" },
      { fetchFn, apiKey: SECRET_KEY, from: "InvestIQ <reviews@example.com>" },
    );
    expect(result).toEqual({ ok: false, unavailable: "provider_error" });
  });

  it("a response missing an id returns provider_error", async () => {
    const fetchFn = fakeFetch({ ok: true, json: {} });
    const result = await sendEmail(
      { to: "owner@example.com", subject: "Hi", text: "Hi", html: "<p>Hi</p>" },
      { fetchFn, apiKey: SECRET_KEY, from: "InvestIQ <reviews@example.com>" },
    );
    expect(result).toEqual({ ok: false, unavailable: "provider_error" });
  });
});

describe("sendEmail — success", () => {
  it("returns the message id from a 2xx response", async () => {
    const fetchFn = fakeFetch({ ok: true, json: { id: "email-123" } });
    const result = await sendEmail(
      { to: "owner@example.com", subject: "Hi", text: "Hi", html: "<p>Hi</p>" },
      { fetchFn, apiKey: SECRET_KEY, from: "InvestIQ <reviews@example.com>" },
    );
    expect(result).toEqual({ ok: true, data: { id: "email-123" } });
  });

  it("posts to the Resend endpoint with a bearer Authorization header", async () => {
    const fetchFn = fakeFetch({ ok: true, json: { id: "email-123" } });
    await sendEmail(
      { to: "owner@example.com", subject: "Hi", text: "Hi", html: "<p>Hi</p>" },
      { fetchFn, apiKey: SECRET_KEY, from: "InvestIQ <reviews@example.com>" },
    );
    const call = (fetchFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("https://api.resend.com/emails");
    const init = call[1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET_KEY}`);
  });
});

describe("sendEmail — the key never leaks into a returned or thrown message", () => {
  it("a network error thrown by fetch never resurfaces the key in the result", async () => {
    const fetchFn = vi.fn(async () => {
      throw new Error(`failed to reach https://api.resend.com/emails?key=${SECRET_KEY}`);
    }) as unknown as typeof fetch;
    const result = await sendEmail(
      { to: "owner@example.com", subject: "Hi", text: "Hi", html: "<p>Hi</p>" },
      { fetchFn, apiKey: SECRET_KEY, from: "InvestIQ <reviews@example.com>" },
    );
    expect(JSON.stringify(result)).not.toContain(SECRET_KEY);
  });

  it("a provider_error response never contains the key", async () => {
    const fetchFn = fakeFetch({ ok: false, status: 401, json: { message: SECRET_KEY } });
    const result = await sendEmail(
      { to: "owner@example.com", subject: "Hi", text: "Hi", html: "<p>Hi</p>" },
      { fetchFn, apiKey: SECRET_KEY, from: "InvestIQ <reviews@example.com>" },
    );
    expect(JSON.stringify(result)).not.toContain(SECRET_KEY);
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<script>alert("hi & bye")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;hi &amp; bye&quot;)&lt;/script&gt;",
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Your portfolio grew 3% this week.")).toBe(
      "Your portfolio grew 3% this week.",
    );
  });
});
