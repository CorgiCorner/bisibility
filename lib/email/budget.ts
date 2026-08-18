import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { EmailCategory } from "./types";

// Defaults are roughly $6/month at full use and act as 10x anomaly brakes, not cost caps.
// The provider cap is the outer wall; this also backstops distributed OTP abuse.
const DEFAULT_EMAIL_DAILY_BUDGETS: Record<EmailCategory, number> = {
  bulk: 1_000,
  transactional: 1_000,
};

type EmailBudgetClient = Pick<Prisma.TransactionClient, "emailDailyStat">;

export function emailBudgetUtcDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function resolveEmailDailyBudget(
  category: EmailCategory,
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const configured =
    category === "bulk" ? env.EMAIL_DAILY_BUDGET_BULK : env.EMAIL_DAILY_BUDGET_TRANSACTIONAL;
  const parsed = Number.parseInt(configured ?? "", 10);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_EMAIL_DAILY_BUDGETS[category];
}

export async function reserveEmailDailyBudget(
  category: EmailCategory,
  now = new Date(),
  client: EmailBudgetClient = prisma,
) {
  const day = emailBudgetUtcDay(now);
  const limit = resolveEmailDailyBudget(category);
  await client.emailDailyStat.upsert({
    create: { category, day },
    update: {},
    where: { day_category: { category, day } },
  });
  const reservation = await client.emailDailyStat.updateMany({
    data: { count: { increment: 1 } },
    where: { category, count: { lt: limit }, day },
  });
  if (reservation.count === 1) {
    return { day, granted: true, limit, notificationDue: false };
  }
  const notice = await client.emailDailyStat.updateMany({
    data: { exhaustionNotifiedAt: now },
    where: { category, day, exhaustionNotifiedAt: null },
  });
  return { day, granted: false, limit, notificationDue: notice.count === 1 };
}
