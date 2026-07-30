import type { KeywordRow } from "@/lib/queries/keywords";
import { frequencyOptions } from "@/lib/settings/options";
import type { GridRenderCellParams } from "@mui/x-data-grid";

function frequencyLabel(frequency: KeywordRow["schedule"]["frequency"]) {
  return frequencyOptions.find((option) => option.value === frequency)?.label ?? frequency;
}

function scheduleSourceLabel(source: KeywordRow["scheduleSource"]) {
  if (source === "project") return "Default";
  if (source === "fallback") return "Fallback";
  return "Custom";
}

export function FrequencyCell({ row }: Readonly<Pick<GridRenderCellParams<KeywordRow>, "row">>) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <span className="text-[12.5px] font-medium text-fg">
        {frequencyLabel(row.schedule.frequency)}
      </span>
      <span className="inline-flex h-5 shrink-0 self-center items-center whitespace-nowrap rounded-full border border-border bg-bg-sunken px-2 font-mono text-[9.5px] font-semibold uppercase leading-none tracking-[0.4px] text-fg-faint">
        {scheduleSourceLabel(row.scheduleSource)}
      </span>
    </span>
  );
}
