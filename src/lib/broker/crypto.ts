// Token encryption for the broker connection (AES-256-GCM, node:crypto).
//
// THIS is the only file that reads BROKER_TOKEN_KEY. It never reads
// the sign-in secret: signing and encryption never share a secret.
//
// Stored form: "v1:<iv>:<tag>:<ciphertext>", each part base64. The owner's
// user id and the broker id are mixed in as "additional authenticated data",
// so a ciphertext copied onto another user's row fails to decrypt.
//
// Nothing here ever throws to a caller, logs, or returns the key or a token
// inside an error message.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type KeyStatus = "dormant" | "enabled" | "invalid_key";

const KEY_BYTES = 32;
const IV_BYTES = 12;
const FORMAT = "v1";

/** Decode the key from the environment. Null when unset or malformed. */
function readKey(): { status: KeyStatus; key: Buffer | null } {
  const raw = process.env.BROKER_TOKEN_KEY?.trim();
  if (!raw) return { status: "dormant", key: null };
  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else if (/^[A-Za-z0-9+/]{43}=?$/.test(raw)) {
    key = Buffer.from(raw, "base64");
  }
  if (!key || key.length !== KEY_BYTES) return { status: "invalid_key", key: null };
  return { status: "enabled", key };
}

export function getKeyStatus(): KeyStatus {
  return readKey().status;
}

function aad(userId: string, provider: string): Buffer {
  return Buffer.from(`broker-token:${FORMAT}:${userId}:${provider}`, "utf8");
}

export type EncryptResult = { ok: true; value: string } | { ok: false };

/** Encrypt a token for one user and broker. Not ok when the key is unusable. */
export function encryptToken(plain: string, userId: string, provider: string): EncryptResult {
  const { key } = readKey();
  if (!key) return { ok: false };
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad(userId, provider));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ok: true,
    value: [FORMAT, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(":"),
  };
}

export type DecryptResult = { ok: true; token: string } | { ok: false };

/** Decrypt. Not ok for a wrong key, wrong owner, tampering or a bad format. */
export function decryptToken(stored: string, userId: string, provider: string): DecryptResult {
  const { key } = readKey();
  if (!key) return { ok: false };
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== FORMAT) return { ok: false };
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const ciphertext = Buffer.from(parts[3], "base64");
    if (iv.length !== IV_BYTES || tag.length !== 16) return { ok: false };
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad(userId, provider));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return { ok: true, token: plain.toString("utf8") };
  } catch {
    return { ok: false };
  }
}
