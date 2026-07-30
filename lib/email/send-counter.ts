import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

type SendCounterClient = Pick<Prisma.TransactionClient, "dailySendCounter">;

export function emailCounterUtcDay(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export async function recordResendSend(
  alreadyReserved: boolean,
  now = new Date(),
  client: SendCounterClient = prisma,
) {
  if (alreadyReserved) {
    return;
  }

  const day = emailCounterUtcDay(now);
  await client.dailySendCounter.upsert({
    create: { count: 1, day },
    update: { count: { increment: 1 } },
    where: { day },
  });
}
