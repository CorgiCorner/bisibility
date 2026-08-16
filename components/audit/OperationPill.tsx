import { type StatusKind, StatusPill } from "@/components/ui";
import type { AuditOperation } from "@/lib/queries/audit";

const operationToStatusKind = {
  CREATE: "create",
  DELETE: "delete",
  EXPORT: "export",
  IMPORT: "import",
  LOGIN: "login",
  UPDATE: "update",
} satisfies Record<AuditOperation, StatusKind>;

export type OperationPillProps = {
  operation: AuditOperation;
};

export function OperationPill({ operation }: Readonly<OperationPillProps>) {
  return <StatusPill size="sm" status={operationToStatusKind[operation]} />;
}
