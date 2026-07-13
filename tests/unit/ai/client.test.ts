import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createAiClient, hasAnthropicKey } from "@/lib/ai/client";

describe("hasAnthropicKey / createAiClient", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it("reports false and returns a typed unavailable result when no key is set", () => {
    expect(hasAnthropicKey()).toBe(false);
    const result = createAiClient();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.unavailable).toBe("no_api_key");
    }
  });

  it("reports true and returns a usable client once a key is set", () => {
    process.env.ANTHROPIC_API_KEY = "test-key-not-real";
    expect(hasAnthropicKey()).toBe(true);
    const result = createAiClient();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.data.messages.parse).toBe("function");
    }
  });
});
