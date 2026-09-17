import { Tooltip } from "@/components/ui/Tooltip";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import { useTranslations } from "next-intl";

type ResearchKeywordCellProps = {
  canRemoveSaved: boolean;
  onToggleSave?: (row: GroupedResearchRow) => void;
  row: GroupedResearchRow;
};

function SaveToggle({
  onToggleSave,
  row,
}: Readonly<{ onToggleSave: () => void; row: GroupedResearchRow }>) {
  const t = useTranslations("projectResearch.saved");
  const label = row.alreadySaved ? t("remove") : t("save");
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
        <BookmarkSimple aria-hidden size={13} weight="regular" />
      </button>
    </Tooltip>
  );
}

export function ResearchKeywordCell({
  canRemoveSaved,
  onToggleSave,
  row,
}: Readonly<ResearchKeywordCellProps>) {
  const t = useTranslations("projectResearch.saved");
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate text-[13px] font-medium text-fg">{row.keyword}</span>
      {row.variants.length > 1 ? (
        <span className="whitespace-nowrap text-[10.5px] text-fg-muted">
          {t("variants", { count: row.variants.length - 1 })}
        </span>
      ) : null}
      {row.alreadyTracked ? (
        <span className="rounded-full border border-border px-1.5 py-0.5 font-sans tabular-nums text-[9.5px] text-fg-muted">
          {t("tracked")}
        </span>
      ) : (
        <>
          {onToggleSave && (!row.alreadySaved || canRemoveSaved) ? (
            <SaveToggle onToggleSave={() => onToggleSave(row)} row={row} />
          ) : row.alreadySaved ? (
            <BookmarkSimple
              aria-hidden
              className="shrink-0 text-accent-text"
              size={13}
              weight="regular"
            />
          ) : null}
          {row.alreadySaved ? (
            <span
              className="rounded-full border px-1.5 py-0.5 font-sans tabular-nums text-[9.5px] text-accent-text"
              style={{
                borderColor: "color-mix(in srgb, var(--accent) 32%, var(--border))",
              }}
            >
              {t("saved")}
            </span>
          ) : null}
        </>
      )}
    </span>
  );
}
