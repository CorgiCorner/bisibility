"use client";

import { RankTrackerTabs } from "@/components/rank-tracker/RankTrackerTabs";
import { useState } from "react";
import { SavedKeywordsTable, type SavedKeywordsTableProps } from "./SavedKeywordsTable";

type SavedKeywordsWorkspaceProps = Omit<SavedKeywordsTableProps, "onCountChange" | "total"> & {
  runsCount: number;
  initialSavedCount: number;
  trackedCount: number;
};

export function SavedKeywordsWorkspace({
  runsCount,
  initialSavedCount,
  trackedCount,
  ...tableProps
}: Readonly<SavedKeywordsWorkspaceProps>) {
  const [savedCount, setSavedCount] = useState(initialSavedCount);
  return (
    <section className="grid min-w-0 gap-4">
      <RankTrackerTabs
        activeTab="saved"
        projectRef={tableProps.projectId}
        runsCount={runsCount}
        savedCount={savedCount}
        trackedCount={trackedCount}
      />
      <SavedKeywordsTable {...tableProps} onCountChange={setSavedCount} total={initialSavedCount} />
    </section>
  );
}
