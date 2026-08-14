import { dataSourceStatusColor, dataSourceStatusTextColor } from "./data-source-status";

export function DataSourceStatusBadge({ status }: Readonly<{ status: string }>) {
  const color = dataSourceStatusColor(status);

  return (
    <span
      className="inline-flex flex-none items-center gap-1.5 rounded-full border px-[9px] py-[3px] font-mono text-[10.5px] font-semibold leading-[1.5]"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)`,
        borderColor: `color-mix(in srgb, ${color} 42%, transparent)`,
        color: dataSourceStatusTextColor(status),
      }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {status}
    </span>
  );
}
