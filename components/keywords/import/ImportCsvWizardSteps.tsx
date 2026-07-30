import {
  ArrowRightIcon as ArrowRight,
  CheckCircleIcon as CheckCircle,
  CloudArrowUpIcon as CloudArrowUp,
  DownloadSimpleIcon as DownloadSimple,
  FileCsvIcon as FileCsv,
  FolderOpenIcon as FolderOpen,
  InfoIcon as Info,
  TableIcon as Table,
} from "@phosphor-icons/react";

const steps = ["Template", "Upload", "Map", "Review", "Done"] as const;
const mapRows = [
  ["keyword", "Keyword", "required"],
  ["target_url", "Target URL", ""],
  ["tags", "Tags", ""],
  ["country", "Country", ""],
  ["device", "Device", ""],
  ["notes", "Ignore this column", ""],
] as const;
const previewRows = [
  ["edge function analytics", "/analytics", "US", ""],
  ["llms.txt seo", "/blog/llms-txt", "US", ""],
  ["vector search ranking", "/search", "US", "DUP"],
  ["open source analytics", "/", "GB", ""],
] as const;

export function ImportStepper({ step }: Readonly<{ step: number }>) {
  return (
    <div className="mt-[18px] flex items-center">
      {steps.map((label, index) => {
        const number = index + 1;
        const active = number <= step;
        return (
          <div className="flex min-w-0 flex-1 items-center" key={label}>
            <span className="flex w-[54px] shrink-0 flex-col items-center gap-1.5">
              <span
                className="grid h-[26px] w-[26px] place-items-center rounded-full border-[1.5px] font-mono text-[11px] font-semibold"
                style={{
                  backgroundColor: active ? "var(--accent)" : "var(--bg-sunken)",
                  borderColor: number === step ? "var(--accent)" : "transparent",
                  color: active ? "#fff" : "var(--fg-faint)",
                }}
              >
                {number}
              </span>
              <span
                className="whitespace-nowrap text-[10px] font-semibold"
                style={{ color: number === step ? "var(--fg)" : "var(--fg-faint)" }}
              >
                {label}
              </span>
            </span>
            {number < steps.length ? (
              <span
                className="mb-5 h-0.5 flex-1 rounded-full"
                style={{ backgroundColor: number < step ? "var(--accent)" : "var(--border)" }}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function TemplateStep() {
  return (
    <div>
      <h3 className="m-0 text-[15px] font-semibold">Start from the template</h3>
      <p className="m-0 mt-1.5 text-[13px] leading-[1.55] text-fg-muted">
        Download the CSV template, fill in your keywords, then upload it on the next step. Only{" "}
        <code className="font-mono text-[12px] text-accent">keyword</code> is required.
      </p>
      <button
        className="mt-4 inline-flex items-center gap-2 rounded-[10px] bg-accent px-4 py-2.5 text-[13.5px] font-semibold text-white"
        type="button"
      >
        <DownloadSimple size={16} weight="bold" />
        Download template.csv
      </button>
      <div className="mt-[18px] overflow-hidden rounded-[11px] border border-border">
        <div className="flex items-center justify-between bg-code-bg px-[13px] py-2 font-mono text-[10.5px] text-code-faint">
          <span>template.csv</span>
          <span className="text-green">UTF-8</span>
        </div>
        <pre className="m-0 overflow-x-auto bg-code-bg px-[15px] py-[13px] font-mono text-[11.5px] leading-[1.75] text-code-fg">{`keyword,target_url,tags,country,device
edge function logs,/docs/logs,docs;infra,US,desktop
vector database,/products/vector,product,US,mobile
llms.txt,/blog/llms-txt,content,GB,desktop`}</pre>
      </div>
      <div className="mt-[18px] flex flex-wrap gap-1.5">
        {["keyword*", "target_url", "tags", "country", "device", "language", "refresh"].map(
          (item) => (
            <span
              className="rounded-[7px] bg-bg-sunken px-[9px] py-[3px] font-mono text-[11px] text-fg-muted first:bg-accent-soft first:font-semibold first:text-accent"
              key={item}
            >
              {item}
            </span>
          ),
        )}
      </div>
      <div className="mt-3 flex items-center gap-[7px] text-[12px] text-fg-faint">
        <Info size={14} />
        Blank columns are ignored. Tags are semicolon-separated.
      </div>
    </div>
  );
}

export function UploadStep() {
  return (
    <div>
      <h3 className="m-0 text-[15px] font-semibold">Upload your file</h3>
      <p className="m-0 mt-1.5 text-[13px] text-fg-muted">
        CSV or XLSX. CSV must be UTF-8 and cannot contain replacement characters (�).
      </p>
      <div className="mt-4 flex flex-col items-center gap-2.5 rounded-[13px] border border-dashed border-border-strong bg-bg px-6 py-[38px] text-center">
        <span className="grid h-[46px] w-[46px] place-items-center rounded-xl bg-accent-soft text-accent">
          <CloudArrowUp size={24} weight="bold" />
        </span>
        <div className="text-[13.5px] font-semibold">Drag and drop your CSV here</div>
        <div className="text-[12px] text-fg-faint">or</div>
        <button
          className="inline-flex items-center gap-[7px] rounded-[9px] border border-border-strong bg-bg-elev px-[15px] py-[9px] text-[12.5px] font-semibold text-fg"
          type="button"
        >
          <FolderOpen size={15} />
          Browse files
        </button>
      </div>
      <div className="mt-3.5 flex items-center gap-3 rounded-[11px] border border-border bg-bg-elev px-[15px] py-[13px]">
        <span className="grid h-9 w-9 place-items-center rounded-[9px] text-green [background:color-mix(in_srgb,var(--green)_12%,transparent)]">
          <FileCsv size={19} weight="fill" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold">acme-keywords-q2.csv</span>
          <span className="block font-mono text-[11px] text-fg-faint">
            248 rows · 5 columns · 18 KB
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-green">
          <CheckCircle size={14} weight="fill" />
          Parsed
        </span>
      </div>
    </div>
  );
}

export function MapStep() {
  return (
    <div>
      <h3 className="m-0 text-[15px] font-semibold">Map columns</h3>
      <p className="m-0 mt-1.5 text-[13px] text-fg-muted">We matched your columns automatically.</p>
      <div className="mt-4 overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[1fr_24px_1fr] gap-2.5 bg-bg-sunken px-[15px] py-[9px] font-mono text-[10px] uppercase tracking-[0.5px] text-fg-muted">
          <span>CSV column</span>
          <span />
          <span>bisibility field</span>
        </div>
        {mapRows.map(([csv, field, req]) => (
          <div
            className="grid grid-cols-[1fr_24px_1fr] items-center gap-2.5 border-t border-border-soft px-[15px] py-[11px]"
            key={csv}
          >
            <span className="inline-flex min-w-0 items-center gap-[7px] font-mono text-[12.5px]">
              <Table className="shrink-0 text-fg-faint" size={14} />
              <span className="truncate">{csv}</span>
            </span>
            <ArrowRight className="text-fg-faint" size={13} weight="bold" />
            <span className="inline-flex items-center justify-between gap-2 rounded-lg border border-border-strong bg-bg-elev px-[11px] py-[7px] text-[12.5px] font-medium">
              {field}
              {req ? <span className="font-mono text-[10px] text-accent">{req}</span> : null}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3.5 flex items-center gap-2 text-[12px] font-semibold text-green">
        <CheckCircle size={14} weight="fill" />
        All required fields mapped
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {["Country US", "Device Desktop", "Refresh Daily"].map((item) => (
          <span
            className="rounded-lg border border-border bg-bg-elev px-[11px] py-1.5 text-[12px]"
            key={item}
          >
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ReviewStep({
  duplicateMode,
  setDuplicateMode,
}: Readonly<{
  duplicateMode: string;
  setDuplicateMode: (value: string) => void;
}>) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 text-[15px] font-semibold">Review and confirm</h3>
        <div className="flex gap-2 font-mono text-[11px]">
          <span className="rounded-full px-[9px] py-[3px] font-semibold text-green [background:color-mix(in_srgb,var(--green)_12%,transparent)]">
            245 new
          </span>
          <span className="rounded-full px-[9px] py-[3px] font-semibold text-yellow [background:color-mix(in_srgb,var(--yellow)_14%,transparent)]">
            3 duplicates
          </span>
        </div>
      </div>
      <div className="mt-3.5 flex items-center gap-2.5 rounded-[11px] border border-border bg-bg px-3.5 py-3">
        <span className="text-[12.5px] text-fg-muted">Duplicates:</span>
        <div className="flex rounded-[9px] border border-border-strong bg-bg-elev p-[3px]">
          {["skip", "overwrite"].map((value) => (
            <button
              className="rounded-[7px] px-[13px] py-1.5 text-[12px] font-semibold"
              key={value}
              onClick={() => setDuplicateMode(value)}
              style={{
                backgroundColor: duplicateMode === value ? "var(--accent)" : "transparent",
                color: duplicateMode === value ? "#fff" : "var(--fg-muted)",
              }}
              type="button"
            >
              {value === "skip" ? "Skip" : "Overwrite"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3.5 overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[1.7fr_1.3fr_50px_64px] gap-2 bg-bg-sunken px-3.5 py-[9px] font-mono text-[10px] uppercase tracking-[0.4px] text-fg-muted">
          <span>Keyword</span>
          <span>Target URL</span>
          <span>Geo</span>
          <span />
        </div>
        {previewRows.map(([keyword, url, country, dup]) => (
          <div
            className="grid grid-cols-[1.7fr_1.3fr_50px_64px] items-center gap-2 border-t border-border-soft px-3.5 py-2.5 text-[12.5px]"
            key={keyword}
          >
            <span className="truncate font-medium">{keyword}</span>
            <span className="truncate font-mono text-[11.5px] text-fg-muted">{url}</span>
            <span className="font-mono text-[11px] text-fg-faint">{country}</span>
            {dup ? (
              <span className="rounded-md px-[7px] py-0.5 font-mono text-[9.5px] font-semibold text-yellow [background:color-mix(in_srgb,var(--yellow)_14%,transparent)]">
                {dup}
              </span>
            ) : null}
          </div>
        ))}
        <div className="border-t border-border-soft px-3.5 py-[9px] text-center font-mono text-[11px] text-fg-faint">
          + 244 more rows
        </div>
      </div>
      <div className="mt-3.5 flex items-center gap-2 text-[12px] text-fg-faint">
        <Info size={14} />
        History is not back-filled.
      </div>
    </div>
  );
}

export function DoneStep() {
  return (
    <div className="flex flex-col items-center px-4 py-[30px] text-center">
      <span className="grid h-14 w-14 place-items-center rounded-[15px] text-green [background:color-mix(in_srgb,var(--green)_12%,transparent)]">
        <CheckCircle size={30} weight="fill" />
      </span>
      <h3 className="m-0 mt-[18px] text-[18px] font-semibold tracking-[-0.4px]">Import complete</h3>
      <p className="m-0 mt-[7px] max-w-[340px] text-[13.5px] leading-[1.55] text-fg-muted">
        245 keywords added, 3 duplicates skipped. First positions appear after the next check.
      </p>
      <div className="mt-[22px] flex gap-6">
        {["245 Added", "3 Skipped", "0 Failed"].map((item) => (
          <span className="text-center" key={item}>
            <span className="block text-[22px] font-semibold">{item.split(" ")[0]}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.4px] text-fg-faint">
              {item.split(" ")[1]}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}
