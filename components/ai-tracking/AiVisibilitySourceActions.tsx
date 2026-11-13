"use client";

import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { RowActionsMenu } from "@/components/ui/RowActionsMenu";
import {
  isFixedSourceOrigin,
  type SourceOverrideType,
  sourceOverrideTypes,
} from "@/lib/ai-tracking/source-types";
import type { AiSourceRow } from "@/lib/ai-tracking/sources-model";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { sourceTypeLabel } from "./source-copy";

export function AiVisibilitySourceActions({
  canWrite,
  onAdd,
  onClearType,
  onRemove,
  onSetType,
  pending,
  row,
}: Readonly<{
  canWrite: boolean;
  onAdd: (domain: string, url: string | null) => void;
  onClearType: (domain: string) => void;
  onRemove: (domain: string) => void;
  onSetType: (domain: string, type: SourceOverrideType) => void;
  pending: boolean;
  row: AiSourceRow;
}>) {
  const t = useTranslations("projectAiTracking");
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  if (isFixedSourceOrigin(row.origin)) return null;
  const disabled = !canWrite || pending;
  const inPlan = row.planState === "todo" || row.planState === "done";
  const setType = !inPlan && row.type === "unsorted";
  const label = row.url ?? row.domain;
  return (
    <div className="flex items-center justify-end gap-2">
      {setType ? (
        <Button
          aria-label={t("sources.setTypeFor", { domain: label })}
          disabled={disabled}
          onClick={(event) => setAnchor(event.currentTarget)}
          className="whitespace-nowrap"
          size="sm"
          type="button"
          variant="secondary"
        >
          {t("sources.setType")}
        </Button>
      ) : null}
      {!setType && !inPlan ? (
        <Button
          aria-label={t("sources.addToPlanFor", { domain: label })}
          disabled={disabled}
          onClick={() => onAdd(row.domain, row.url)}
          className="whitespace-nowrap"
          size="sm"
          type="button"
          variant="secondary"
        >
          {t("sources.addToPlan")}
        </Button>
      ) : null}
      {inPlan ? (
        <Button
          aria-label={t("sources.inPlanFor", { domain: label })}
          disabled={disabled}
          onClick={() => onRemove(row.domain)}
          className="whitespace-nowrap"
          size="sm"
          type="button"
          variant="secondary"
        >
          {t("sources.inPlan")}
        </Button>
      ) : null}
      <RowActionsMenu
        ariaLabel={t("sources.rowActions", { domain: label })}
        items={[
          ...sourceOverrideTypes.map((type) => ({
            disabled,
            label: sourceTypeLabel(type, t),
            onSelect: () => onSetType(row.domain, type),
          })),
          ...(row.origin === "override"
            ? [
                {
                  disabled,
                  label: t("sources.clearType"),
                  onSelect: () => onClearType(row.domain),
                },
              ]
            : []),
        ]}
      />
      <Menu anchorEl={anchor} onClose={() => setAnchor(null)} open={Boolean(anchor)}>
        {sourceOverrideTypes.map((type) => (
          <MenuItem
            key={type}
            onClick={() => {
              setAnchor(null);
              onSetType(row.domain, type);
            }}
          >
            {sourceTypeLabel(type, t)}
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
}
