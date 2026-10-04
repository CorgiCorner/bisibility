import type { ReportJson } from "@/lib/agent-reports/model";

function label(key: string) {
  return key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/_/g, " ");
}

export function ReportBody({ value, depth = 0 }: Readonly<{ value: ReportJson; depth?: number }>) {
  if (value === null) return <span className="text-fg-muted">-</span>;
  if (typeof value !== "object")
    return (
      <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{String(value)}</p>
    );
  if (depth >= 6)
    return (
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px]">
        {JSON.stringify(value, null, 2)}
      </pre>
    );
  if (Array.isArray(value))
    return (
      <ol className="grid list-none gap-3">
        {value.map((item, index) => (
          <li className="min-w-0 border-l border-border pl-3" key={`${index}-${typeof item}`}>
            <ReportBody value={item} depth={depth + 1} />
          </li>
        ))}
      </ol>
    );
  return (
    <dl className="grid min-w-0 gap-4">
      {Object.entries(value).map(([key, item]) => (
        <div className="grid min-w-0 gap-1" key={key}>
          <dt className="font-sans text-[11px] uppercase tracking-wide text-fg-muted">
            {label(key)}
          </dt>
          <dd className="min-w-0">
            <ReportBody value={item} depth={depth + 1} />
          </dd>
        </div>
      ))}
    </dl>
  );
}
