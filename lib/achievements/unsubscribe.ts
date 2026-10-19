import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { readDemoConfig } from "@/lib/demo/config";
import { getPurposeSecretKeys } from "@/lib/providers/crypto";

const purpose = "achievement-email-unsubscribe";
export function createAchievementUnsubscribeToken(userId: string) {
  const key = getPurposeSecretKeys(purpose)[0];
  if (!key) throw new Error("Email signing is unavailable.");
  const payload = Buffer.from(userId).toString("base64url");
  return `${payload}.${createHmac("sha256", key).update(payload).digest("base64url")}`;
}
export function verifyAchievementUnsubscribeToken(token: string) {
  if (!token || token.length > 1000) return null;
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
    where: { userId },
    data: { emailEnabled: false, revision: { increment: 1 } },
  });
  return true;
}
