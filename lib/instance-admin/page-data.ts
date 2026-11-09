import type { getOssAccounts } from "@/lib/queries/admin/oss-accounts";
import type { getOssAudit } from "@/lib/queries/admin/oss-audit";
import type { getOssEmailSending, getOssEmailSettings } from "@/lib/queries/admin/oss-email";
import type { getOssOverview, getOssWorker } from "@/lib/queries/admin/oss-operations";
import type { getOssTasks } from "@/lib/queries/admin/oss-tasks";

export type AdminPageData = {
  operations?: Awaited<ReturnType<typeof getOssWorker | typeof getOssOverview>>;
  accounts?: Awaited<ReturnType<typeof getOssAccounts>>;
  email?: Awaited<ReturnType<typeof getOssEmailSending>>;
  settings?: Awaited<ReturnType<typeof getOssEmailSettings>>;
  tasks?: Awaited<ReturnType<typeof getOssTasks>>;
  audit?: Awaited<ReturnType<typeof getOssAudit>>;
};
export type AdminSearch = Record<string, string | string[] | undefined>;
export const searchValue = (params: AdminSearch, key: string) =>
  typeof params[key] === "string" ? params[key] : undefined;
