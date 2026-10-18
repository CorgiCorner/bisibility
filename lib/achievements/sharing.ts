import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { readDemoConfig } from "@/lib/demo/config";
import { achievementsEnabled } from "./config";
import { shareSchema } from "./schema";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function setAchievementSharing(userId: string, input: unknown) {
  const data = shareSchema.parse(input);
  if (!achievementsEnabled() || readDemoConfig().kind !== "disabled")
    return { kind: "disabled" as const };
  const token = data.published ? randomBytes(32).toString("base64url") : null;
  const changed = await prisma.achievementAward.updateMany({
    where: { userId, kind: data.kind, definitionVersion: 1 },
    data: { shareTokenHash: token ? hash(token) : null },
  });
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { publicId: true },
  });
  if (changed.count)
    await writeAudit({
      action: "account.achievements_sharing",
      actorId: userId,
      targetId: user.publicId,
      targetType: "user",
      after: { kind: data.kind, published: data.published },
    });
  return changed.count ? { kind: "saved" as const, token } : { kind: "not_earned" as const };
}
export async function readPublicAchievement(token: string) {
  if (!achievementsEnabled() || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const award = await prisma.achievementAward.findUnique({
    where: { shareTokenHash: hash(token) },
    select: {
      kind: true,
      earnedDay: true,
      definitionVersion: true,
      user: { select: { deactivatedAt: true } },
    },
  });
  return award &&
    !award.user.deactivatedAt &&
    (award.kind === "presence" || award.kind === "practice")
    ? { kind: award.kind as "presence" | "practice", earnedDay: award.earnedDay }
    : null;
}
