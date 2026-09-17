"use client";

import { DeveloperActionsMenu } from "@/components/settings/developers/DeveloperActionsMenu";
import type { MarketsPageRow } from "@/lib/markets/page-model";
import { useTranslations } from "next-intl";

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
  const t = useTranslations("projectMarkets");
  return (
    <DeveloperActionsMenu
      ariaLabel={t("actionsFor", { market: market.name })}
      items={[
        ...(onAddKeywords
          ? [
              {
                disabled: !canAddKeywords,
                label: t("addKeywords"),
                onSelect: () => onAddKeywords(market),
              },
            ]
          : []),
        { disabled: !canEdit, label: t("edit"), onSelect: () => onEdit(market) },
        {
          danger: true,
          disabled: !canArchive,
          label: t("archive"),
          onSelect: () => onArchive(market),
        },
      ]}
    />
  );
}
