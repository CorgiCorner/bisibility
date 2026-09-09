import { Checkbox } from "@/components/ui/Checkbox";
import { useId } from "react";
import type { ScheduleKeywordCandidate } from "./AddKeywordsDrawer";

type ScheduleKeywordCandidateRowProps = {
  candidate: ScheduleKeywordCandidate;
  onToggle: () => void;
  selected: boolean;
};

function membershipLabel(candidate: ScheduleKeywordCandidate) {
  if (candidate.assigned) return "Already here";
  return candidate.sourceName ? `on ${candidate.sourceName}` : "Manual";
}

export function ScheduleKeywordCandidateRow({
  candidate,
  onToggle,
  selected,
}: Readonly<ScheduleKeywordCandidateRowProps>) {
  const inputId = useId();
  const muted = candidate.assigned;

  return (
    <label
      className={`flex w-full cursor-pointer items-center gap-2.5 rounded-control px-3 py-2.25 hover:bg-bg-sunken ${muted ? "cursor-not-allowed text-fg-muted" : "text-fg"}`}
      htmlFor={inputId}
    >
      <Checkbox
        checked={candidate.assigned || selected}
        disabled={candidate.assigned}
        id={inputId}
        onChange={onToggle}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[12.5px] font-semibold leading-5 ${muted ? "text-fg-muted" : "text-fg"}`}
        >
          {candidate.keyword}
        </span>
        <span className="mt-px block text-[10.5px] leading-4 text-fg-muted">
          {candidate.checks} checks
        </span>
      </span>
      <span className="shrink-0 whitespace-nowrap text-[11px] text-fg-muted">
        {membershipLabel(candidate)}
      </span>
    </label>
  );
}
