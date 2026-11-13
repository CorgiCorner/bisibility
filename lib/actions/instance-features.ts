"use server";

import { writeAudit } from "@/lib/auth/audit";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { PROJECT_SEO_CHALLENGE_SETTING } from "@/lib/challenge-report/feature";
import { prisma } from "@/lib/db/prisma";
import { readDemoConfig } from "@/lib/demo/config";
import { revalidatePath } from "next/cache";

export async function setProjectSeoChallengeEnabled(enabled: boolean) {
  const session = await getInstanceAdminSession();
  if (!session || typeof enabled !== "boolean" || readDemoConfig().kind !== "disabled") {
    return { ok: false } as const;
  }
  const key = PROJECT_SEO_CHALLENGE_SETTING;
  const value = String(enabled);
  await prisma.$transaction(async (transaction) => {
    await transaction.instanceSetting.upsert({
      create: { key, value },
      update: { value },
      where: { key },
    });
    await writeAudit(
      {
        action: "instance_admin.project_seo_challenge.set",
        actorId: session.user.id,
        after: { enabled },
        targetId: key,
        targetType: "instance_ops",
      },
      transaction,
    );
  });
  revalidatePath("/app", "layout");
  return { ok: true, enabled } as const;
}
