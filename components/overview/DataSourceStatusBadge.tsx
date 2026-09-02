import {
  dataSourceStatusColor,
  dataSourceStatusLabel,
  dataSourceStatusTextColor,
} from "./data-source-status";

export function DataSourceStatusBadge({ status }: Readonly<{ status: string }>) {
  const color = dataSourceStatusColor(status);

  return (
    <span
      className="inline-flex flex-none items-center gap-1 p-0 font-sans tabular-nums text-[10px] font-semibold leading-4"
      style={{ color: dataSourceStatusTextColor(status) }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
      {dataSourceStatusLabel(status)}
    </span>
  );
}
