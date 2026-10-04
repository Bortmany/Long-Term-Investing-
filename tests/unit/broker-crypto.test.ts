import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decryptToken, encryptToken, getKeyStatus } from "@/lib/broker/crypto";
import { isBrokerConnectionEnabled } from "@/lib/broker/config";
import { logger } from "@/lib/logger";

const KEY_A = Buffer.alloc(32, 7).toString("base64");
const KEY_B = Buffer.alloc(32, 9).toString("base64");
const TOKEN = "FAKE-TOKEN-ROUNDTRIP-123";

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.BROKER_TOKEN_KEY;
  process.env.BROKER_TOKEN_KEY = KEY_A;
});
afterEach(() => {
  if (saved === undefined) delete process.env.BROKER_TOKEN_KEY;
  else process.env.BROKER_TOKEN_KEY = saved;
});

describe("broker token encryption", () => {
  it("round-trips a token", () => {
    const enc = encryptToken(TOKEN, "user-1", "ibkr_flex");
    expect(enc.ok).toBe(true);
    if (!enc.ok) return;
    expect(enc.value.startsWith("v1:")).toBe(true);
    expect(enc.value).not.toContain(TOKEN);
    const dec = decryptToken(enc.value, "user-1", "ibkr_flex");
    expect(dec).toEqual({ ok: true, token: TOKEN });
  });

  it("uses a fresh IV every time", () => {
    const a = encryptToken(TOKEN, "user-1", "ibkr_flex");
    const b = encryptToken(TOKEN, "user-1", "ibkr_flex");
    expect(a.ok && b.ok && a.value !== b.value).toBe(true);
    if (a.ok && b.ok) expect(a.value.split(":")[1]).not.toBe(b.value.split(":")[1]);
  });

  it("refuses tampered ciphertext, tag or iv", () => {
    const enc = encryptToken(TOKEN, "user-1", "ibkr_flex");
    if (!enc.ok) throw new Error("setup");
    const [v, iv, tag, ct] = enc.value.split(":");
    const flip = (b64: string) => {
      const buf = Buffer.from(b64, "base64");
      buf[0] ^= 0xff;
      return buf.toString("base64");
    };
    expect(decryptToken([v, iv, tag, flip(ct)].join(":"), "user-1", "ibkr_flex").ok).toBe(false);
    expect(decryptToken([v, iv, flip(tag), ct].join(":"), "user-1", "ibkr_flex").ok).toBe(false);
    expect(decryptToken([v, flip(iv), tag, ct].join(":"), "user-1", "ibkr_flex").ok).toBe(false);
  });

  it("refuses a bad format without throwing", () => {
    expect(decryptToken("garbage", "user-1", "ibkr_flex").ok).toBe(false);
    expect(decryptToken("v2:a:b:c", "user-1", "ibkr_flex").ok).toBe(false);
    expect(decryptToken("v1:a:b:c", "user-1", "ibkr_flex").ok).toBe(false);
    expect(decryptToken("", "user-1", "ibkr_flex").ok).toBe(false);
  });

  it("refuses a ciphertext copied onto another user (wrong user id)", () => {
    const enc = encryptToken(TOKEN, "user-A", "ibkr_flex");
    if (!enc.ok) throw new Error("setup");
    expect(decryptToken(enc.value, "user-B", "ibkr_flex").ok).toBe(false);
    expect(decryptToken(enc.value, "user-A", "other_broker").ok).toBe(false);
  });

  it("refuses the wrong key", () => {
    const enc = encryptToken(TOKEN, "user-1", "ibkr_flex");
    if (!enc.ok) throw new Error("setup");
    process.env.BROKER_TOKEN_KEY = KEY_B;
    expect(decryptToken(enc.value, "user-1", "ibkr_flex").ok).toBe(false);
  });

  it("accepts a 64-character hex key", () => {
    process.env.BROKER_TOKEN_KEY = "ab".repeat(32);
    expect(getKeyStatus()).toBe("enabled");
    const enc = encryptToken(TOKEN, "u", "ibkr_flex");
    expect(enc.ok && decryptToken(enc.value, "u", "ibkr_flex").ok).toBe(true);
  });

  it("unset, short, or malformed keys leave the feature dormant", () => {
    delete process.env.BROKER_TOKEN_KEY;
    expect(getKeyStatus()).toBe("dormant");
    expect(isBrokerConnectionEnabled()).toBe(false);
    expect(encryptToken(TOKEN, "u", "ibkr_flex").ok).toBe(false);

    for (const bad of ["short", Buffer.alloc(16, 1).toString("base64"), "z".repeat(64), "!".repeat(44)]) {
      process.env.BROKER_TOKEN_KEY = bad;
      expect(getKeyStatus()).toBe("invalid_key");
      expect(isBrokerConnectionEnabled()).toBe(false);
      expect(encryptToken(TOKEN, "u", "ibkr_flex").ok).toBe(false);
    }
  });

  it("an invalid key logs one error that does not contain the key", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.BROKER_TOKEN_KEY = "not-a-valid-key-value";
    isBrokerConnectionEnabled();
    isBrokerConnectionEnabled();
    const lines = spy.mock.calls.map((c) => String(c[0]));
    spy.mockRestore();
    expect(lines.join("\n")).not.toContain("not-a-valid-key-value");
  });
});

describe("secret handling in the source", () => {
  const root = path.resolve(__dirname, "../..");

  it("the crypto file never reads the sign-in secret", () => {
    const src = readFileSync(path.join(root, "src/lib/broker/crypto.ts"), "utf8");
    expect(src).not.toContain("BETTER_AUTH_SECRET");
  });

  it("the key variable is read only in crypto.ts", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(name) && readFileSync(full, "utf8").includes("BROKER_TOKEN_KEY")) {
          hits.push(path.relative(root, full));
        }
      }
    };
    walk(path.join(root, "src"));
    expect(hits).toEqual(["src/lib/broker/crypto.ts"]);
  });

  it("nothing in the broker code can place an order or move money", () => {
    const dirs = ["src/lib/broker", "src/app/actions/broker.ts"];
    const files: string[] = [];
    const walk = (p: string) => {
      if (statSync(p).isDirectory()) readdirSync(p).forEach((n) => walk(path.join(p, n)));
      else files.push(p);
    };
    dirs.forEach((d) => walk(path.join(root, d)));
    for (const f of files) {
      const src = readFileSync(f, "utf8").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
      expect(src, f).not.toMatch(/placeOrder|submitOrder|createOrder|\/orders|transfer(Funds|Cash)|withdraw/i);
    }
  });
});

describe("logger redaction", () => {
  it("redacts encrypted/ciphertext/token keys", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("x", { encryptedToken: "AAA-SECRET", ciphertext: "BBB-SECRET", token: "CCC-SECRET", ok: "visible" });
    const line = String(spy.mock.calls[0][0]);
    spy.mockRestore();
    expect(line).not.toContain("SECRET");
    expect(line).toContain("visible");
  });
});
