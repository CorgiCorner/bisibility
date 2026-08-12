import { Button } from "@/components/ui";
import type { GroupedResearchRow } from "@/lib/keyword-research/grouping";
import { appPath } from "@/lib/routing/app-path";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react";
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
        className="mt-3 flex items-center justify-center gap-2 rounded-[9px] border border-border bg-bg-sunken px-3 py-2.5 text-[12.5px] font-semibold text-accent-text hover:border-border-strong"
        href={`${appPath(projectRef, "rank-tracker")}?tab=saved`}
      >
        <BookmarkSimple aria-hidden size={14} weight="fill" />
        Saved / view in Keywords
      </Link>
    );
  }
  if (!onSave) return null;
  return (
    <div className="mt-2 grid gap-1.5">
      <Button
        onClick={() => onSave(row)}
        startIcon={<BookmarkSimple size={14} />}
        sx={{
          width: "100%",
          backgroundColor: "var(--bg-sidebar)",
          border: "1px solid var(--accent)",
          color: "var(--accent-hover)",
          "&:hover": {
            backgroundColor: "var(--bg-sidebar)",
            border: "1px solid var(--accent-hover)",
          },
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
