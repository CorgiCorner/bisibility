"use client";

import { DeveloperActionsMenu } from "@/components/settings/developers/DeveloperActionsMenu";
import type { MarketsPageRow } from "@/lib/markets/page-model";
import { useTranslations } from "next-intl";

type MarketsRowMenuProps = {
  canAddKeywords: boolean;
  canArchive: boolean;
  canEdit: boolean;
  canRunChecks?: boolean;
  market: MarketsPageRow;
  onAddKeywords?: (market: MarketsPageRow) => void;
  onArchive: (market: MarketsPageRow) => void;
  onEdit: (market: MarketsPageRow) => void;
  onRunChecks?: (market: MarketsPageRow) => void;
};

export function MarketsRowMenu({
  canAddKeywords,
  canArchive,
  canEdit,
  canRunChecks = false,
  market,
  onAddKeywords,
  onArchive,
  onEdit,
  onRunChecks,
}: Readonly<MarketsRowMenuProps>) {
  const t = useTranslations("projectMarkets");
  const run = useTranslations("shared.rankPreflight");
  return (
    <DeveloperActionsMenu
      ariaLabel={t("actionsFor", { market: market.name })}
      items={[
        ...(onRunChecks
          ? [
              {
                disabled:
                  !canRunChecks || market.status !== "active" || market.activeKeywordCount === 0,
                label: run("runMarket"),
                onSelect: () => onRunChecks(market),
              },
            ]
          : []),
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
