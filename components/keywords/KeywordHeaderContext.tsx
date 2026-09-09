"use client";

import type { KeywordRow } from "@/lib/queries/keywords";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import type { AddKeywordsMatrixInput, BulkKeywordIdsInput } from "@/lib/schemas/keyword";
import { useState } from "react";
import type { KeywordAction } from "./action-utils";
import { KeywordMarketsDrawer } from "./KeywordMarketsDrawer";
import { TargetSwitcher } from "./TargetSwitcher";

type KeywordHeaderContextProps = {
  addKeywordsMatrixAction: KeywordAction<AddKeywordsMatrixInput>;
  bulkDeleteAction: KeywordAction<BulkKeywordIdsInput>;
  canCreateKeyword: boolean;
  canUpdateKeyword: boolean;
  keyword: KeywordRow;
  projectId: string;
  projectMarkets: ProjectMarketsView;
  targets: readonly KeywordRow[];
};

export function KeywordHeaderContext({
  addKeywordsMatrixAction,
  bulkDeleteAction,
  canCreateKeyword,
  canUpdateKeyword,
  keyword,
  projectId,
  projectMarkets,
  targets,
}: Readonly<KeywordHeaderContextProps>) {
  const [editingMarkets, setEditingMarkets] = useState(false);
  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: navigation context, not form fields */}
      <div
        aria-label="Keyword context"
        className="flex min-w-0 max-w-full flex-wrap items-center gap-2"
        role="group"
      >
        <TargetSwitcher
          keyword={keyword}
          onAddMarket={
            canCreateKeyword && canUpdateKeyword ? () => setEditingMarkets(true) : undefined
          }
          projectId={projectId}
          projectMarkets={projectMarkets}
          targets={targets}
        />
      </div>
      {canUpdateKeyword ? (
        <KeywordMarketsDrawer
          addKeywordsMatrixAction={addKeywordsMatrixAction}
          bulkDeleteAction={bulkDeleteAction}
          canCreateKeyword={canCreateKeyword}
          keyword={keyword}
          onClose={() => setEditingMarkets(false)}
          open={editingMarkets}
          projectId={projectId}
          projectMarkets={projectMarkets}
          targets={targets}
        />
      ) : null}
    </>
  );
}
