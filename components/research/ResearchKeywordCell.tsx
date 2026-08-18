import { Tooltip } from "@/components/ui";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react";

type ResearchKeywordCellProps = {
  canRemoveSaved: boolean;
  onToggleSave: (row: GroupedResearchRow) => void;
  row: GroupedResearchRow;
};

function SaveToggle({
  onToggleSave,
  row,
}: Readonly<{ onToggleSave: () => void; row: GroupedResearchRow }>) {
  const label = row.alreadySaved ? "Remove from saved" : "Save for later";
  return (
    <Tooltip content={label}>
      <button
        aria-label={label}
        className={
          row.alreadySaved
            ? "grid shrink-0 cursor-pointer place-items-center p-0 text-accent-text"
            : "bv-research-save-toggle grid shrink-0 cursor-pointer place-items-center p-0 text-fg-muted"
        }
        onClick={(event) => {
          event.stopPropagation();
          onToggleSave();
        }}
        type="button"
      >
        <BookmarkSimple aria-hidden size={13} weight={row.alreadySaved ? "fill" : "regular"} />
      </button>
    </Tooltip>
  );
}

export function ResearchKeywordCell({
  canRemoveSaved,
  onToggleSave,
  row,
}: Readonly<ResearchKeywordCellProps>) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-[13px] font-medium text-fg">{row.keyword}</span>
      {row.variants.length > 1 ? (
        <span className="whitespace-nowrap text-[10.5px] text-fg-muted">
          +{row.variants.length - 1} variants
        </span>
      ) : null}
      {row.alreadyTracked ? (
        <span className="rounded-full border border-border-strong px-1.5 py-0.5 font-mono text-[9.5px] text-fg-muted">
          Tracked
        </span>
      ) : (
        <>
          {!row.alreadySaved || canRemoveSaved ? (
            <SaveToggle onToggleSave={() => onToggleSave(row)} row={row} />
          ) : (
            <BookmarkSimple
              aria-hidden
              className="shrink-0 text-accent-text"
              size={13}
              weight="fill"
            />
          )}
          {row.alreadySaved ? (
            <span
              className="rounded-full border px-1.5 py-0.5 font-mono text-[9.5px] text-accent-text"
              style={{
                borderColor: "color-mix(in srgb, var(--accent) 32%, var(--border))",
              }}
            >
              Saved
            </span>
          ) : null}
        </>
      )}
    </span>
  );
}
