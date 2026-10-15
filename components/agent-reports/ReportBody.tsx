import type { ReportJson } from "@/lib/agent-reports/model";

function label(key: string) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

export function ReportBody({ value, depth = 0 }: Readonly<{ value: ReportJson; depth?: number }>) {
  if (value === null) return <span className="text-fg-muted">-</span>;
  if (typeof value !== "object")
    return (
      <p className="m-0 whitespace-pre-wrap [overflow-wrap:anywhere] text-[13px] leading-normal">
        {String(value)}
      </p>
    );
  if (depth >= 6)
    return (
      <pre className="m-0 max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px]">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  if (Array.isArray(value))
    return (
      <ol className="m-0 grid list-none gap-3 p-0">
        {value.map((item, index) => (
          <li
            className="min-w-0 rounded-control border border-border bg-bg-sunken p-3"
            key={`${index}-${typeof item}`}
          >
            <ReportBody value={item} depth={depth + 1} />
          </li>
        ))}
      </ol>
    );
  return (
    <dl className="m-0 grid min-w-0 gap-3">
      {Object.entries(value).map(([key, item]) => (
        <div
          className={
            item === null || typeof item !== "object"
              ? "grid min-w-0 gap-1 sm:grid-cols-[minmax(7rem,0.25fr)_minmax(0,1fr)] sm:gap-3"
              : "grid min-w-0 gap-2"
          }
          key={key}
        >
          <dt className="pt-0.5 text-[12px] font-medium text-fg-muted">{label(key)}</dt>
          <dd className="m-0 min-w-0">
            <ReportBody value={item} depth={depth + 1} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
