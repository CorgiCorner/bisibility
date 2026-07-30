import { Prisma } from "@/lib/generated/prisma/client";

export const dispatcherEffectiveFrequency = Prisma.sql`
  (CASE WHEN ks.id IS NOT NULL THEN ks.frequency ELSE pd.frequency END)::text
`;

export const dispatcherEligibleFilter = Prisma.sql`
  owner."deactivatedAt" IS NULL
  AND p."writeMode" = 'active'
  AND ${dispatcherEffectiveFrequency} IN ('daily', 'weekly', 'monthly', 'custom_cron')
`;
