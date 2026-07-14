/**
 * Blok 3.1 — at-rest encryption for Square OAuth tokens.
 *
 * AES-256-GCM. The key comes ONLY from `ORDERLY_TOKEN_ENCRYPTION_KEY` (never
 * hardcoded, never committed). Any UTF-8 secret works — it is hashed with
 * SHA-256 to derive a stable 32-byte key, so operators don't have to hand-craft
 * exactly-32-byte secrets.
 *
 * Storage format (single string, safe for a text column):
 *   v1:<ivHex>:<authTagHex>:<ciphertextHex>
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12; // recommended for GCM
const FORMAT_TAG = "v1";

let cachedKey: Buffer | null = null;
let cachedKeySource: string | undefined;

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

/** Returns null (never throws) when the encryption key is not configured. */
export function getTokenEncryptionKey(): Buffer | null {
  const secret = process.env.ORDERLY_TOKEN_ENCRYPTION_KEY?.trim();
  if (!secret) return null;
  if (cachedKey && cachedKeySource === secret) return cachedKey;
  cachedKey = deriveKey(secret);
  cachedKeySource = secret;
  return cachedKey;
}

export function isTokenEncryptionConfigured(): boolean {
  return getTokenEncryptionKey() !== null;
}

/** Throws a clear, actionable error rather than silently no-op'ing. */
export function encryptToken(plaintext: string): string {
  const key = getTokenEncryptionKey();
  if (!key) {
    throw new Error(
      "ORDERLY_TOKEN_ENCRYPTION_KEY is not set — cannot encrypt Square tokens at rest.",
    );
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    FORMAT_TAG,
    iv.toString("hex"),
    authTag.toString("hex"),
    ciphertext.toString("hex"),
  ].join(":");
}

export function decryptToken(stored: string): string {
  const key = getTokenEncryptionKey();
  if (!key) {
    throw new Error(
      "ORDERLY_TOKEN_ENCRYPTION_KEY is not set — cannot decrypt stored Square tokens.",
    );
  }
  const parts = stored.split(":");
  if (parts.length !== 4 || parts[0] !== FORMAT_TAG) {
    throw new Error("Unrecognized encrypted token format");
  }
  const [, ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
