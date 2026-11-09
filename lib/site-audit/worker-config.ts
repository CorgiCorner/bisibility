import "server-only";

import { prisma } from "@/lib/db/prisma";
import { schedulerDriver } from "@/lib/scheduler/driver";

export async function siteAuditWorkerEnabled() {
  const row = await prisma.instanceSetting.findUnique({
    where: { key: "siteAudit.worker" },
    select: { value: true },
  });
  return row?.value === "1";
}

export async function siteAuditWorkerAvailable() {
  return (await siteAuditWorkerEnabled()) && schedulerDriver() !== "none";
}

export async function siteAuditInlineFallbackEnabled() {
  const row = await prisma.instanceSetting.findUnique({
    where: { key: "siteAudit.inlineFallback" },
    select: { value: true },
  });
  return row?.value === "1";
}
