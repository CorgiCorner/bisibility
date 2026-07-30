import type { AuditOperation } from "@/lib/queries/audit";

export type OperationPillProps = {
  operation: AuditOperation;
};

const operationColors = {
  CREATE: "var(--green)",
  DELETE: "var(--red)",
  EXPORT: "var(--blue)",
  IMPORT: "var(--blue)",
  LOGIN: "var(--purple)",
  UPDATE: "var(--yellow)",
} satisfies Record<AuditOperation, string>;

export function OperationPill({ operation }: Readonly<OperationPillProps>) {
  const color = operationColors[operation];
  return (
    <span
      className="inline-flex rounded-md px-2 py-0.5 font-mono text-[10px] font-bold leading-none tracking-[0.3px]"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
        color,
      }}
    >
      {operation}
    </span>
  );
}
