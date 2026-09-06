"use client";

import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui";
import { type MarketScope, marketRunPartition } from "@/lib/markets/market-scope";
import type { KeywordRow } from "@/lib/queries/keywords";
import { appPath } from "@/lib/routing/app-path";
import type { SerpDepth } from "@/lib/serp/markets";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react";
import Link from "next/link";
import { RunChecksSplitButton } from "./RunChecksSplitButton";

type Props = {
  checksRunning: boolean;
  chosenDepth: SerpDepth | null;
  marketScope: MarketScope | null;
  onDepthChange: (depth: SerpDepth) => void;
  onRunChecks: (keywordIds: string[], depth?: SerpDepth) => void;
  projectId: string;
  providerConnected: boolean;
  readOnly: boolean;
  selectedRows: KeywordRow[];
};

/**
 * The money controls over the current selection. Inside a market the primary control spends in
 * THAT market and says so; the wider run is a separate, quieter control instead of the same
 * button quietly meaning more. At the project level there is one scope, so there is one button.
 */
export function BulkRunChecksControls({
  checksRunning,
  chosenDepth,
  marketScope,
  onDepthChange,
  onRunChecks,
  projectId,
  providerConnected,
  readOnly,
  selectedRows,
}: Readonly<Props>) {
  if (!providerConnected) {
    return (
      <Button
        component={Link}
        endIcon={<CaretRight aria-hidden size={12} weight="regular" />}
        href={appPath(projectId, "integrations")}
        size="xs"
      >
        Connect a SERP provider
      </Button>
    );
  }

  const runScope = marketRunPartition(selectedRows, marketScope);
  const inMarketRows = marketScope
    ? selectedRows.filter((row) => runScope.inMarketIds.includes(row.id))
    : selectedRows;
  const crossMarketIds = runScope.crossMarketIds;

  return (
    <>
      {inMarketRows.length > 0 ? (
        <RunChecksSplitButton
          checksRunning={checksRunning}
          chosenDepth={chosenDepth}
          marketScope={marketScope}
          onDepthChange={onDepthChange}
          onRunChecks={onRunChecks}
          readOnly={readOnly}
          selectedRows={inMarketRows}
        />
      ) : null}
      {crossMarketIds ? (
        <ProjectReadOnlyTooltip>
          <Button
            disabled={readOnly || checksRunning}
            onClick={() => onRunChecks(crossMarketIds)}
            size="xs"
            variant="ghost"
          >
            Run checks in all markets
          </Button>
        </ProjectReadOnlyTooltip>
      ) : null}
    </>
  );
}
