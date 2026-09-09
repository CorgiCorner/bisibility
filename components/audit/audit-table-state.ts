import type {
  DataTableDensity,
  DataTablePagination,
  DataTableSort,
} from "@/components/ui/data-table/data-table-types";

export const AUDIT_TABLE_ID = "audit-log";
export const AUDIT_TABLE_DENSITY = "standard" satisfies DataTableDensity;
export const AUDIT_TABLE_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
export type AuditTablePaginationState = Pick<DataTablePagination, "page" | "pageSize">;

export const AUDIT_TABLE_DEFAULT_PAGINATION = {
  page: 1,
  pageSize: 10,
} satisfies AuditTablePaginationState;
export const AUDIT_TABLE_DEFAULT_SORT = {
  direction: "desc",
  field: "timestamp",
} satisfies DataTableSort;

export function auditTablePagination(
  rowCount: number,
  pagination: AuditTablePaginationState,
): DataTablePagination {
  return { ...pagination, pageSizeOptions: AUDIT_TABLE_PAGE_SIZE_OPTIONS, rowCount };
}

// The primitive's standard density intentionally replaces the old bespoke 52px audit rows.
