import "server-only";

import { prisma } from "@/lib/db/prisma";
import { readOnlyDemoConfig } from "./config";

export async function demoSnapshotCapturedAt() {
  const config = readOnlyDemoConfig();
  if (!config) return null;
  const setting = await prisma.instanceSetting.findUnique({
    where: { key: "demo.snapshot.v1" },
    select: { value: true },
  });
  try {
    const marker = JSON.parse(setting?.value ?? "null");
    return marker?.projectPublicId === config.projectPublicId &&
      typeof marker.capturedAt === "string" &&
      Number.isFinite(Date.parse(marker.capturedAt))
      ? marker.capturedAt
      : null;
  } catch {
    return null;
  }
}
