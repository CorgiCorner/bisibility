"use client";

import { KeywordsTabs } from "@/components/keywords/KeywordsTabs";
import { useState } from "react";
import { SavedKeywordsTable, type SavedKeywordsTableProps } from "./SavedKeywordsTable";

type SavedKeywordsWorkspaceProps = Omit<SavedKeywordsTableProps, "onCountChange" | "total"> & {
  initialSavedCount: number;
  trackedCount: number;
};

export function SavedKeywordsWorkspace({
  initialSavedCount,
  trackedCount,
  ...tableProps
}: Readonly<SavedKeywordsWorkspaceProps>) {
  const [savedCount, setSavedCount] = useState(initialSavedCount);
  return (
    <section className="grid min-w-0 gap-4">
      <KeywordsTabs
        activeTab="saved"
        projectRef={tableProps.projectId}
        savedCount={savedCount}
        trackedCount={trackedCount}
      />
      <SavedKeywordsTable {...tableProps} onCountChange={setSavedCount} total={initialSavedCount} />
    </section>
  );
}
