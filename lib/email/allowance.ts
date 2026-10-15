import "server-only";

import { requireInstanceAdmin } from "@/lib/auth/instance-admin";
import { prisma } from "@/lib/db/prisma";
import { readOnlyDemoConfig } from "@/lib/demo/config";
import { deploymentMode } from "@/lib/deployment/deployment";
import type { InstanceEmailAllowance } from "./allowance-model";
import { emailBudgetUtcDay, resolveEmailDailyBudget } from "./budget";
import { configuredEmailFrom } from "./from";
import { readInstanceMailStatus, refreshInstanceMailRuntime } from "./instance-mail-store";
import { isEmailConfigured } from "./registry";

const categories = ["bulk", "transactional"] as const;

async function allowanceCapability(): Promise<InstanceEmailAllowance["status"]> {
  try {
    if (readOnlyDemoConfig()) return "disabled";
    if (!process.env.EMAIL_PROVIDER?.trim()) {
      if (deploymentMode() === "cloud") return "not_configured";
      const stored = await readInstanceMailStatus();
      if (!stored.provider || !stored.credentialsConfigured) return "not_configured";
      await refreshInstanceMailRuntime();
      // Stored metadata exists, so a failed runtime resolution is unknown, not absent.
      if (!isEmailConfigured()) return "unavailable";
    } else if (!isEmailConfigured()) {
      return "not_configured";
    }
    return configuredEmailFrom() ? "available" : "not_configured";
  } catch {
    return "unavailable";
  }
}

/** Reads this installation's reserved recipient attempts, never provider quota or delivery totals. */
export async function getInstanceAdminEmailAllowance(
  now = new Date(),
): Promise<InstanceEmailAllowance> {
  await requireInstanceAdmin();
  const day = emailBudgetUtcDay(now);
  const state: InstanceEmailAllowance = {
    asOf: now.toISOString(),
    day: day.toISOString(),
    resetsAt: new Date(day.getTime() + 86_400_000).toISOString(),
    scope: "installation",
    status: await allowanceCapability(),
    categories: [],
  };
  if (state.status !== "available") return state;
  state.categories = categories.map((category) => ({
    category,
    limit: resolveEmailDailyBudget(category),
    reservedAttempts: null,
    remaining: null,
  }));
  try {
    const rows = await prisma.emailDailyStat.findMany({
      where: { day, category: { in: [...categories] } },
      select: { category: true, count: true },
    });
    if (rows.some((row) => !Number.isSafeInteger(row.count) || row.count < 0))
      throw new Error("Invalid email attempt count");
    state.categories = state.categories.map((category) => {
      const reservedAttempts = rows.find((row) => row.category === category.category)?.count ?? 0;
      return {
        ...category,
        reservedAttempts,
        remaining: Math.max(category.limit - reservedAttempts, 0),
      };
    });
  } catch {
    state.status = "unavailable";
  }
  return state;
}
