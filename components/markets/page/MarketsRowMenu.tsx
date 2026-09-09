"use client";

import { DeveloperActionsMenu } from "@/components/settings/developers/DeveloperActionsMenu";
import type { MarketsPageRow } from "@/lib/markets/page-model";

type MarketsRowMenuProps = {
  canAddKeywords: boolean;
  canArchive: boolean;
  canEdit: boolean;
  market: MarketsPageRow;
  onAddKeywords?: (market: MarketsPageRow) => void;
  onArchive: (market: MarketsPageRow) => void;
  onEdit: (market: MarketsPageRow) => void;
};

export function MarketsRowMenu({
  canAddKeywords,
  canArchive,
  canEdit,
  market,
  onAddKeywords,
  onArchive,
  onEdit,
}: Readonly<MarketsRowMenuProps>) {
  return (
    <DeveloperActionsMenu
      ariaLabel={`Actions for ${market.name}`}
      items={[
        ...(onAddKeywords
          ? [
              {
                disabled: !canAddKeywords,
                label: "Add keywords",
                onSelect: () => onAddKeywords(market),
              },
            ]
          : []),
        { disabled: !canEdit, label: "Edit market", onSelect: () => onEdit(market) },
        {
          danger: true,
          disabled: !canArchive,
          label: "Archive market",
          onSelect: () => onArchive(market),
        },
      ]}
    />
  );
}
