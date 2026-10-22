import type { Prisma } from "@/lib/generated/prisma/client";

export const keywordMembershipSelect = {
  archivedAt: true,
  cronExpression: true,
  enabled: true,
  frequency: true,
  jitterMinutes: true,
  publicId: true,
  timeOfDay: true,
  timezone: true,
} as const satisfies Prisma.CheckScheduleSelect;

export const keywordMembershipPricingSelect = {
  ...keywordMembershipSelect,
  serpDepth: true,
  providerPolicy: true,
} as const satisfies Prisma.CheckScheduleSelect;
