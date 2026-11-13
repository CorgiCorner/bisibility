"use client";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn, DataTableSort } from "@/components/ui/data-table/data-table-types";
import { FieldLabel } from "@/components/ui/FieldLabel";
import { Input } from "@/components/ui/Input";
import { accountSearchInput } from "@/lib/instance-admin/account-list-input";
import type {
  AdminAccountsState,
  AdminAccountView as PreviewAccount,
} from "@/lib/ops/admin-account-view";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { useForm, useWatch } from "react-hook-form";

export type AccountListControls = {
  search: string;
  sorting: DataTableSort | null;
  page: number;
  pageSize: number;
  rowCount: number;
  onSearch: (search: string) => void;
  onSort: (sort: DataTableSort | null) => void;
  onPage: (page: { page: number; pageSize: number }) => void;
};

export function OssAccountsTable({
  accounts,
  totalCount = accounts.length,
  onLookup,
  state = "ready",
  busy = false,
  additionalColumns = [],
  server,
}: {
  accounts: PreviewAccount[];
  server?: AccountListControls;
  totalCount?: number;
  state?: AdminAccountsState;
  busy?: boolean;
  additionalColumns?: DataTableColumn<PreviewAccount>[];
  onLookup?: (query: string) => void;
}) {
  const t = useTranslations("instanceAdmin.accounts");
  const searchId = useId();
  const form = useForm<{ search: string }>({
    resolver: zodResolver(accountSearchInput),
    defaultValues: { search: server?.search ?? "" },
  });
  const search = useWatch({ control: form.control, name: "search" });
  const [sorting, setSorting] = useState<DataTableSort | null>(null);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 10 });
  const filtered =
    state === "ready"
      ? server
        ? accounts
        : accounts.filter((account) =>
            `${account.email} ${account.id}`.toLowerCase().includes(search.trim().toLowerCase()),
          )
      : [];
  const columns: DataTableColumn<PreviewAccount>[] = [
    {
      id: "email",
      header: t("email"),
      accessorKey: "email",
      size: 240,
      meta: { sortable: true, flex: 1 },
      cell: ({ row }) => (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy || !onLookup}
          onClick={() => onLookup?.(row.original.id)}
        >
          {row.original.email}
        </Button>
      ),
    },
    ...(
      [
        ["status", t("status")],
        ["created", t("created")],
        ["lastActive", t("lastActive")],
        ["projects", t("projects")],
      ] as const
    ).map(([id, header]) => ({
      id,
      header,
      accessorFn: (row: PreviewAccount) => {
        const value = row[id];
        if (id === "created" || id === "lastActive") {
          const timestamp = Date.parse(String(value));
          return Number.isFinite(timestamp) ? timestamp : undefined;
        }
        return value ?? undefined;
      },
      cell: ({ row }: { row: { original: PreviewAccount } }) =>
        id === "status"
          ? t(`statuses.${row.original.status}`)
          : (row.original[id] ?? t("notReported")),
      sortUndefined: "last" as const,
      size: 150,
      meta: { sortable: true },
    })),
    ...additionalColumns,
  ];
  return (
    <Card data-testid="oss-accounts" component="section" size="lg" className="min-w-0">
      <h3 className="text-sm font-semibold">
        {state === "ready" ? t("count", { count: totalCount }) : t("title")}
      </h3>
      <form
        className="my-3 flex flex-col gap-1.5"
        onSubmit={form.handleSubmit(({ search }) => server?.onSearch(search))}
      >
        <FieldLabel
          className="text-sm font-medium text-fg"
          htmlFor={searchId}
          label={t("searchLabel")}
        />
        <Input
          density="compact"
          id={searchId}
          placeholder={t("searchPlaceholder")}
          disabled={state !== "ready"}
          maxLength={320}
          {...form.register("search", {
            onChange: () => setPagination((current) => ({ ...current, page: 1 })),
          })}
        />
        {server && (
          <Button type="submit" size="sm" variant="secondary" className="self-start">
            {t("searchLabel")}
          </Button>
        )}
      </form>
      <div className="min-w-0 overflow-x-auto">
        <DataTable
          id="instance-accounts"
          ariaLabel={t("title")}
          columns={columns}
          rows={filtered}
          pending={state === "loading" || busy}
          onRowClick={!busy && onLookup ? (row) => onLookup(row.id) : undefined}
          pagination={{
            ...(server ?? pagination),
            rowCount: server?.rowCount ?? filtered.length,
            pageSizeOptions: [10, 25, 50],
          }}
          paginationMode={server ? "server" : "client"}
          onPaginationChange={server?.onPage ?? setPagination}
          sorting={server?.sorting ?? sorting}
          onSortingChange={(sort) => {
            if (server) {
              server.onSort(sort);
              return;
            }
            setSorting(sort);
            setPagination((current) => ({ ...current, page: 1 }));
          }}
          sortingMode={server ? "server" : "client"}
          layout="auto"
          emptyState={
            <p role="status" className="p-4 text-sm text-fg-muted">
              {state === "loading"
                ? t("loading")
                : state === "unavailable"
                  ? t("unavailable")
                  : t("empty")}
            </p>
          }
        />
      </div>
    </Card>
  );
}
