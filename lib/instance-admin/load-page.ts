import "server-only";
import { recoveryFiltersSchema } from "@/lib/metering/recovery/input";
import { accountListInput } from "@/lib/queries/admin/oss-account-list";
import { getOssAccounts } from "@/lib/queries/admin/oss-accounts";
import { getOssAudit } from "@/lib/queries/admin/oss-audit";
import { getOssEmailSending, getOssEmailSettings } from "@/lib/queries/admin/oss-email";
import {
  getOssChecks,
  getOssDataSources,
  getOssNotifications,
  getOssOverview,
  getOssWorker,
} from "@/lib/queries/admin/oss-operations";
import { getOssTasks } from "@/lib/queries/admin/oss-tasks";
import { type AdminPageData, type AdminSearch, searchValue } from "./page-data";

export async function loadAdminPage(view: string, params: AdminSearch): Promise<AdminPageData> {
  const value = (key: string) => searchValue(params, key);
  switch (view) {
    case "Status":
      return { operations: await getOssOverview() };
    case "Worker":
      return { operations: await getOssWorker() };
    case "Checks":
      return { operations: await getOssChecks() };
    case "Data sources":
      return { operations: await getOssDataSources() };
    case "Notifications":
      return { operations: await getOssNotifications() };
    case "Accounts": {
      const options = accountListInput.safeParse({
        search: value("search"),
        sort: value("sort") === "none" ? undefined : value("sort"),
        direction: value("direction"),
        page: value("page") ? Number(value("page")) : undefined,
        pageSize: value("pageSize") ? Number(value("pageSize")) : undefined,
      });
      return { accounts: await getOssAccounts(options.success ? options.data : {}) };
    }
    case "Sending today":
      return { email: await getOssEmailSending() };
    case "Settings":
      return { settings: await getOssEmailSettings() };
    case "Tasks": {
      const filters = recoveryFiltersSchema.safeParse({
        category: value("category"),
        provider: value("provider"),
        cursor: value("cursor"),
      });
      return { tasks: await getOssTasks(filters.success ? filters.data : {}) };
    }
    case "Audit":
      return { audit: await getOssAudit({ filter: value("filter"), cursor: value("cursor") }) };
    default:
      throw new Error("Unknown administration page.");
  }
}
