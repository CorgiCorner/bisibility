import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ShadowHandoff } from "./shadow-engine";
export async function persistQueuedHandoff(taskId: string, handoff: ShadowHandoff | undefined) {
  if (process.env.METERING_SHADOW !== "on" || !handoff) return;
  try {
    await prisma.queuedRankCheckTask.update({
      where: { id: taskId },
      data: { meteringContext: handoff },
    });
  } catch {
    console.warn("[metering] queued context unavailable", { taskId });
  }
}
