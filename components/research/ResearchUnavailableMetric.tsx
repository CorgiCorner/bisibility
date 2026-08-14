import { RESEARCH_METRICS_UNAVAILABLE_TOOLTIP } from "@/lib/serp/market-capability";
import Tooltip from "@mui/material/Tooltip";

export function ResearchUnavailableMetric({
  label,
  className = "font-mono text-fg-muted",
}: Readonly<{ className?: string; label: string }>) {
  return (
    <Tooltip title={RESEARCH_METRICS_UNAVAILABLE_TOOLTIP}>
      <span aria-label={label} className={`${className} cursor-help`}>
        n/a
      </span>
    </Tooltip>
  );
}
