import { Button } from "@/components/ui/Button";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import { rankTrackerTabPath } from "@/lib/routing/app-path";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/dist/csr/BookmarkSimple";
import Link from "next/link";

type ResearchDetailSaveActionProps = {
  onSave?: (row: GroupedResearchRow) => void;
  projectRef: string;
  row: GroupedResearchRow;
};

export function ResearchDetailSaveAction({
  onSave,
  projectRef,
  row,
}: Readonly<ResearchDetailSaveActionProps>) {
  if (row.alreadySaved) {
    return (
      <Link
        className="mt-3 flex items-center justify-center gap-2 rounded-control border border-border-control bg-bg-sunken px-3 py-2.5 text-[12.5px] font-semibold text-accent-text hover:border-border-control"
        href={rankTrackerTabPath(projectRef, "saved")}
      >
        <BookmarkSimple aria-hidden size={14} weight="regular" />
        Saved / view in Keywords
      </Link>
    );
  }
  if (!onSave) return null;
  return (
    <div className="mt-2 grid gap-1.5">
      <Button
        onClick={() => onSave(row)}
        startIcon={<BookmarkSimple weight="regular" size={14} />}
        style={{
          width: "100%",
          "--control-background-color": "var(--bg-sidebar)",
          "--control-border": "1px solid var(--accent)",
          "--control-color": "var(--accent-hover)",
          "--control-hover-background-color": "var(--bg-sidebar)",
          "--control-hover-border": "1px solid var(--accent-hover)",
        }}
        variant="secondary"
      >
        Save for later
      </Button>
      <p className="m-0 text-center text-[12px] text-fg-muted">
        Free. No checks run until you track it.
      </p>
    </div>
  );
}
