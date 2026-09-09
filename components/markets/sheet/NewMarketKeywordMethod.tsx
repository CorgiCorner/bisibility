"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Textarea";
import type { NewMarketCreateInput } from "@/lib/markets/create-input";

export type NewMarketSource = { id: string; keywordCount: number; name: string };

type NewMarketKeywordMethodProps = {
  onChange: (value: NewMarketCreateInput["method"]) => void;
  pasteError: string | null;
  sources: readonly NewMarketSource[];
  value: NewMarketCreateInput["method"] | undefined;
};

function sourceOptions(sources: readonly NewMarketSource[]) {
  const largest = Math.max(0, ...sources.map((source) => source.keywordCount));
  return sources.map((source) => ({
    label: `${source.name} - ${source.keywordCount} keywords${source.keywordCount === largest ? " (largest)" : ""}`,
    value: source.id,
  }));
}

export function NewMarketKeywordMethod({
  onChange,
  pasteError,
  sources,
  value,
}: Readonly<NewMarketKeywordMethodProps>) {
  return (
    <section aria-label="Keyword method" className="grid gap-3">
      <SegmentedControl
        label="Keywords"
        labelClassName="text-[12px] font-medium text-fg"
        onChange={(kind) => {
          if (kind === "copy") {
            onChange({ kind, sourceMarketId: "" as `pmkt_${string}` });
          } else if (kind === "paste") {
            onChange({ kind, text: "" });
          } else if (kind === "empty") {
            onChange({ kind });
          }
        }}
        options={[
          { label: "Copy from market", value: "copy" },
          { label: "Paste keywords", value: "paste" },
          { label: "Start empty", value: "empty" },
        ]}
        size="field"
        value={value?.kind ?? ""}
      />
      {value?.kind === "copy" ? (
        <div className="grid gap-1.5">
          <MenuSelect
            ariaLabel="Copy from"
            onChange={(sourceMarketId) =>
              onChange({ kind: "copy", sourceMarketId: sourceMarketId as `pmkt_${string}` })
            }
            options={sourceOptions(sources)}
            searchable
            searchPlaceholder="Find a market"
            size="input"
            value={value.sourceMarketId}
          />
          {sources.length === 0 ? (
            <p className="m-0 text-[12px] text-fg-muted">No other market to copy from yet.</p>
          ) : value.sourceMarketId ? null : (
            <p className="m-0 text-[12px] text-fg-muted">Pick the market to copy from.</p>
          )}
        </div>
      ) : null}
      {value?.kind === "paste" ? (
        <div className="grid gap-1.5">
          <Textarea
            aria-label="Paste keywords"
            onChange={(event) => onChange({ kind: "paste", text: event.target.value })}
            placeholder="One keyword per line\nOptional per line: keyword | https://example.com/page"
            resize="vertical"
            value={value.text}
          />
          {pasteError ? (
            <p className="m-0 text-[12px] text-red-text" role="alert">
              {pasteError}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
