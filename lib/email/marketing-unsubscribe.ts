import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { getPurposeSecretKeys } from "@/lib/providers/crypto";

const PURPOSE = "marketing-email-unsubscribe";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function createMarketingUnsubscribeToken(userId: string) {
  const secret = getPurposeSecretKeys(PURPOSE)[0];
  if (!secret) throw new Error("BISIBILITY_SECRETS_KEY could not be resolved.");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", secret, iv, {
    authTagLength: TAG_BYTES,
  });
  const payload = Buffer.from(JSON.stringify({ purpose: PURPOSE, userId }), "utf8");
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url");
}

function decryptToken(token: string, secret: Buffer) {
  try {
    const value = Buffer.from(token, "base64url");
    if (value.toString("base64url") !== token) return null;
    if (value.length <= IV_BYTES + TAG_BYTES) return null;
    const iv = value.subarray(0, IV_BYTES);
    const tag = value.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const encrypted = value.subarray(IV_BYTES + TAG_BYTES);
    const decipher = createDecipheriv("aes-256-gcm", secret, iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function verifyMarketingUnsubscribeToken(token: string) {
  if (!token || token.length > 2_000) return null;
  for (const secret of getPurposeSecretKeys(PURPOSE)) {
    const decoded = decryptToken(token, secret);
    if (!decoded) continue;
    try {
      const payload = JSON.parse(decoded) as { purpose?: unknown; userId?: unknown };
      if (
        payload.purpose === PURPOSE &&
        typeof payload.userId === "string" &&
        payload.userId.length > 0 &&
        payload.userId.length <= 200
      ) {
        return payload.userId;
      }
    } catch {}
  }
  return null;
}

export async function unsubscribeFromMarketingEmails(token: string) {
  const userId = verifyMarketingUnsubscribeToken(token);
  if (!userId) return false;
  await prisma.user.updateMany({
    data: { marketingEmailUnsubscribedAt: new Date() },
    where: { id: userId, marketingEmailUnsubscribedAt: null },
  });
  return true;
}
