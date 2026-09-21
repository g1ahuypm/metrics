import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// Integration tokens are stored in the database encrypted with AES-256-GCM.
// The key is derived from APP_SECRET, so rotating APP_SECRET invalidates stored tokens.

function key(): Buffer {
  const secret = process.env.APP_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("APP_SECRET must be set to a random string of at least 16 characters");
  }
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const [version, ivB64, tagB64, dataB64] = payload.split(":");
  if (version !== "v1" || !ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** Show only the last 4 characters of a secret. */
export function mask(secret: string | null | undefined): string {
  if (!secret) return "";
  return `••••••••${secret.slice(-4)}`;
}
