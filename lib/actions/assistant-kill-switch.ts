"use server";

import {
  type AssistantGuardKey,
  isAssistantGuardKey,
  parseAssistantGuardValue,
  readAssistantGuardConfig,
} from "@/lib/assistant/guard-config";
import {
  ASSISTANT_KILL_SWITCH_LEVELS,
  ASSISTANT_KILL_SWITCH_SETTING,
  type AssistantKillSwitch,
  readAssistantKillSwitch,
} from "@/lib/assistant/kill-switch";
import { killSwitchReasonSchema } from "@/lib/assistant/kill-switch-reason";
import { ASSISTANT_BREAKER_RESET_SETTING } from "@/lib/assistant/spend-breaker";
import { writeAudit } from "@/lib/auth/audit";
import { getInstanceAdminSession } from "@/lib/auth/instance-admin";
import { prisma } from "@/lib/db/prisma";

/**
 * Instance admin only: sets the assistant kill switch. Turning it back to "on" also resets a
 * tripped spend breaker: its windows restart at that moment, and this is the only way back on.
 * Every flip needs a reason (trimmed, 1-500 characters) and writes an audit record with the level
 * before and after and that reason.
 */
export async function setAssistantKillSwitch(level: AssistantKillSwitch, reason: string) {
  const session = await getInstanceAdminSession();
  const parsedReason = killSwitchReasonSchema().safeParse(reason);
  if (!session || !ASSISTANT_KILL_SWITCH_LEVELS.includes(level) || !parsedReason.success)
    return { ok: false } as const;
  const key = ASSISTANT_KILL_SWITCH_SETTING;
  await prisma.$transaction(async (transaction) => {
    const before = await readAssistantKillSwitch(transaction);
    await transaction.instanceSetting.upsert({
      create: { key, value: level },
      update: { value: level },
      where: { key },
    });
    if (level === "on" && before !== "on") {
      const resetAt = new Date().toISOString();
      await transaction.instanceSetting.upsert({
        create: { key: ASSISTANT_BREAKER_RESET_SETTING, value: resetAt },
        update: { value: resetAt },
        where: { key: ASSISTANT_BREAKER_RESET_SETTING },
      });
    }
    await writeAudit(
      {
        action: "instance_admin.assistant_kill_switch.set",
        actorId: session.user.id,
        before: { level: before },
        after: { level, reason: parsedReason.data },
        targetId: key,
        targetType: "instance_ops",
      },
      transaction,
    );
  });
  return { ok: true, level } as const;
}

/**
 * Instance admin only: changes one spending guard (a positive whole number: cents of hosted
 * spend, attempts, or turns). Audited with the value before and after.
 */
export async function setAssistantGuard(key: AssistantGuardKey, value: string) {
  const session = await getInstanceAdminSession();
  const parsed = parseAssistantGuardValue(value);
  if (!session || !isAssistantGuardKey(key) || parsed === null) return { ok: false } as const;
  await prisma.$transaction(async (transaction) => {
    const before = (await readAssistantGuardConfig(transaction))[key];
    await transaction.instanceSetting.upsert({
      create: { key, value: String(parsed) },
      update: { value: String(parsed) },
      where: { key },
    });
    await writeAudit(
      {
        action: "instance_admin.assistant_guard.set",
        actorId: session.user.id,
        before: { key, value: before },
        after: { key, value: parsed },
        targetId: key,
        targetType: "instance_ops",
      },
      transaction,
    );
  });
  return { ok: true, key, value: parsed } as const;
}
