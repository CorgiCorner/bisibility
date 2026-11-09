import "server-only";
import { prisma } from "@/lib/db/prisma";

export async function domainVerificationEnabled() {
  const setting = await prisma.instanceSetting.findUnique({
    where: { key: "domainVerification.enabled" },
    select: { value: true },
  });
  return setting?.value === "1";
}
