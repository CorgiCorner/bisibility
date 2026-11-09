"use client";
import { AdminTableState } from "@/components/admin/AdminTableState";
import { OssAdminComposition } from "@/components/admin/redesign/OssAdminComposition";
import type { OssAdminData } from "@/components/admin/redesign/OssAdminViews";
import { PreviewNavigationContext } from "@/components/admin/redesign/PreviewNavigationContext";
import { runOpsSweepNow, sendTestSlackNotification } from "@/lib/actions/instance-admin";
import {
  resetInstanceAdminAccountLimits,
  setInstanceAdminAccountDeactivated,
} from "@/lib/actions/instance-admin-account-actions";
import {
  clearInstanceMailSettings,
  saveInstanceMailSettings,
} from "@/lib/actions/instance-mail-settings";
import type { AdminPageData } from "@/lib/instance-admin/page-data";
import { ossAdminRoute } from "@/lib/instance-admin/routes";
import { AdminPageError } from "./AdminPageError";
import { useAdminAccount } from "./useAdminAccount";
import { useAdminQuery } from "./useAdminQuery";
import { useTaskActions } from "./useTaskActions";

export function OssLivePage({
  view,
  data,
  failed = false,
  dangerousActionsAllowed,
}: {
  view: string;
  data: AdminPageData;
  failed?: boolean;
  dangerousActionsAllowed?: boolean;
}) {
  const query = useAdminQuery();
  const selection = useAdminAccount();
  const taskActions = useTaskActions(query.refresh, {
    batch: query.params?.get("batch") ?? null,
    command: query.params?.get("command") ?? null,
    update: query.update,
  });
  const administration = data.accounts ?? data.settings;
  const composed: OssAdminData = {
    operations: data.operations
      ? {
          ...data.operations,
          onSendTest: async () => {
            const result = await sendTestSlackNotification();
            query.refresh();
            return result;
          },
          onRunSweep: async () => {
            const result = await runOpsSweepNow();
            query.refresh();
            return result;
          },
        }
      : null,
    emailAllowance: data.email ?? null,
    administration: administration
      ? {
          ...administration,
          account: selection.account,
          busy: selection.busy,
          error: selection.error,
          drawerOpen: selection.drawer,
          onCloseDrawer: selection.close,
          onOpenAccount: (id) => selection.lookup(id, true),
          twoFactorEnabled: dangerousActionsAllowed ?? administration.twoFactorEnabled,
          accountListKey: query.params?.toString(),
          accountList: data.accounts
            ? {
                search: query.params?.get("search") ?? "",
                sorting:
                  query.params?.get("sort") === "none"
                    ? null
                    : {
                        field: query.params?.get("sort") ?? "created",
                        direction: query.params?.get("direction") === "asc" ? "asc" : "desc",
                      },
                page: data.accounts.page,
                pageSize: data.accounts.pageSize,
                rowCount: data.accounts.filteredCount,
                onSearch: (search) => query.update({ search, page: 1 }),
                onSort: (sort) =>
                  query.update({
                    sort: sort?.field ?? "none",
                    direction: sort?.direction ?? "desc",
                    page: 1,
                  }),
                onPage: (page) => query.update(page),
              }
            : undefined,
          onLookup: selection.lookup,
          onAccountAction: async (action, userId) => {
            const result =
              action === "reset"
                ? await resetInstanceAdminAccountLimits({ userId })
                : await setInstanceAdminAccountDeactivated({
                    userId,
                    deactivated: action === "deactivate",
                  });
            if (result.status === "completed") {
              await selection.reload();
              query.refresh();
            }
            return result;
          },
          onSaveMail: async (settings) => {
            const result = await saveInstanceMailSettings(settings);
            if (result.status === "saved") query.refresh();
            return result;
          },
          onClearMail: async () => {
            const result = await clearInstanceMailSettings();
            if (result.status === "cleared") query.refresh();
            return result;
          },
        }
      : null,
    recovery: data.tasks
      ? {
          ...data.tasks,
          ...taskActions,
          twoFactorEnabled: dangerousActionsAllowed ?? data.tasks.twoFactorEnabled,
          busy: taskActions.busy || query.pending,
          initialCategory: query.params?.get("category") ?? "all",
          initialProvider: query.params?.get("provider") ?? "all",
          hasPrevious: !!query.params?.get("cursor"),
          live: true,
          onRefresh: query.refresh,
          onPage: (cursor, filters) => query.update({ cursor, ...filters }),
          onFilterChange: (filters) => query.update({ ...filters, cursor: undefined }),
        }
      : null,
    audit: data.audit
      ? {
          ...data.audit,
          initialFilter: data.audit.initialFilter ?? "all",
          onNext: (cursor) => query.update({ cursor }),
          onFirst: query.params?.get("cursor")
            ? () => query.update({ cursor: undefined })
            : undefined,
          onFilterChange: (filter) => query.update({ filter, cursor: undefined }),
          onRetry: query.refresh,
        }
      : null,
  };
  // Retain a full serializable section boundary; failures never render fixture data.
  if (failed || !Object.values(data).some(Boolean)) return <AdminPageError reset={query.refresh} />;
  return (
    <AdminTableState value={{ get: (key) => query.params?.get(key) ?? null, update: query.update }}>
      <PreviewNavigationContext
        value={(destination) => query.router.push(ossAdminRoute(destination).href)}
      >
        <OssAdminComposition
          key={
            view === "Tasks"
              ? `${view}:${query.params?.get("category")}:${query.params?.get("provider")}:${query.params?.get("cursor")}`
              : view === "Audit"
                ? `${view}:${data.audit?.initialFilter}:${query.params?.get("cursor")}`
                : view
          }
          view={view}
          data={composed}
        />
      </PreviewNavigationContext>
    </AdminTableState>
  );
}
