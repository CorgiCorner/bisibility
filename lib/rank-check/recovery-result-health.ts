import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { recoveryInstance } from "@/lib/metering/recovery/tokens";

const key = (namespace: string) => `rank-result-recovery-health:${namespace}:${recoveryInstance()}`;
export async function saveResultRecoveryHealth(
  tx: Prisma.TransactionClient,
  namespace: string,
  restored: number,
) {
  const value = JSON.stringify({ lastActivityAt: new Date().toISOString(), restored });
  await tx.$executeRaw`INSERT INTO metering_metadata(key,value) VALUES(${key(namespace)},${value})
    ON CONFLICT(key) DO UPDATE SET value=excluded.value`;
}
export async function readResultRecoveryActivity(tx: Prisma.TransactionClient, namespace: string) {
  const [row] = await tx.$queryRaw<
    { value: string }[]
  >`SELECT value FROM metering_metadata WHERE key=${key(namespace)}`;
  try {
    const value = JSON.parse(row?.value ?? "null");
    return typeof value?.lastActivityAt === "string" &&
      Number.isFinite(Date.parse(value.lastActivityAt))
      ? (value.lastActivityAt as string)
      : null;
  } catch {
    return null;
  }
}
