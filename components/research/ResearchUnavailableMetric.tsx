import { Tooltip } from "@/components/ui/Tooltip";

const RESEARCH_SCOPE_UNAVAILABLE_TOOLTIP =
  "No search volume or difficulty data for this country and language. Rank tracking is unaffected.";

export function ResearchUnavailableMetric({
  label,
  className = "font-sans tabular-nums text-fg-muted",
}: Readonly<{ className?: string; label: string }>) {
  return (
    <Tooltip content={RESEARCH_SCOPE_UNAVAILABLE_TOOLTIP}>
      <span aria-label={label} className={`${className} cursor-help`}>
        n/a
      </span>
    </Tooltip>
  );
}
