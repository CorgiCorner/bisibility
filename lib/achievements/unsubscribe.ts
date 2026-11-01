import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { readDemoConfig } from "@/lib/demo/config";
import { getPurposeSecretKeys } from "@/lib/providers/crypto";

const purpose = "achievement-email-unsubscribe";
export function createAchievementUnsubscribeToken(userId: string) {
  const key = getPurposeSecretKeys(purpose)[0];
  if (!key) throw new Error("Email signing is unavailable.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(userId, "utf8"), cipher.final()]);
  return `v2.${Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64url")}`;
}
export function verifyAchievementUnsubscribeToken(token: string) {
  if (!token || token.length > 1000) return null;
  if (token.startsWith("v2.")) {
    const encoded = token.slice(3);
    const value = Buffer.from(encoded, "base64url");
    if (value.length <= 28 || value.toString("base64url") !== encoded) return null;
    for (const key of getPurposeSecretKeys(purpose)) {
      try {
        const decipher = createDecipheriv("aes-256-gcm", key, value.subarray(0, 12), {
          authTagLength: 16,
        });
        decipher.setAuthTag(value.subarray(12, 28));
        const id = Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString(
          "utf8",
        );
        if (id.length > 0 && id.length <= 200) return id;
      } catch {}
    }
    return null;
  }
  const [payload, signature, ...extra] = token.split(".");
  if (!payload || !signature || extra.length) return null;
  const supplied = Buffer.from(signature, "base64url");
  for (const key of getPurposeSecretKeys(purpose)) {
    const expected = createHmac("sha256", key).update(payload).digest();
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
      const id = Buffer.from(payload, "base64url").toString("utf8");
      if (id.length > 0 && id.length <= 200 && Buffer.from(id).toString("base64url") === payload)
        return id;
    }
  }
  return null;
}
export async function unsubscribeAchievementEmail(token: string) {
  if (readDemoConfig().kind !== "disabled") return false;
  const userId = verifyAchievementUnsubscribeToken(token);
  if (!userId) return false;
  await prisma.achievementState.updateMany({
    where: { userId, emailEnabled: true },
    data: { emailEnabled: false, revision: { increment: 1 } },
  });
  return true;
}
