"use client";

import {
  bulkBarButtonStyle,
  outlinedSplitChromeStyle,
} from "@/components/keywords/grid/bulk-action-styles";
import { settingsSectionHref } from "@/components/settings/shell/settings-sections";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { ButtonGroup } from "@/components/ui/ButtonGroup";
import { Menu } from "@/components/ui/Menu";
import { MenuActionFooter } from "@/components/ui/MenuActionFooter";
import { menuSelectPaperStyle } from "@/components/ui/MenuSelect";
import { MenuSelectOptionItem } from "@/components/ui/MenuSelectOptionItem";
import { Tooltip } from "@/components/ui/Tooltip";
import { type SerpDepth, serpDepthValues } from "@/lib/serp/constants";
import { VISIBILITY_HORIZON, VISIBILITY_SHALLOW_CHECK_COPY } from "@/lib/visibility/definition";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { useState } from "react";

export type CheckDepthSplitButtonSize = "md" | "xs";

type CheckDepthSplitButtonProps = {
  actionLabel: string;
  caretAriaLabel?: string;
  currentDepth: SerpDepth | null;
  disabled?: boolean;
  onAction: () => void;
  onDepthChange: (depth: SerpDepth) => void;
  optionLabel?: (depth: SerpDepth) => string;
  size?: CheckDepthSplitButtonSize;
  spinning?: boolean;
};

const caretStyle = { minWidth: 34, paddingLeft: 6, paddingRight: 6 } as const;

function splitButtonStyle(size: CheckDepthSplitButtonSize) {
  if (size === "xs") return bulkBarButtonStyle;
  return { ...outlinedSplitChromeStyle, minHeight: 36 };
}

export function CheckDepthSplitButton({
  actionLabel,
  caretAriaLabel = "Choose check depth",
  currentDepth,
  disabled = false,
  onAction,
  onDepthChange,
  optionLabel = (depth) => `Top ${depth}`,
  size = "md",
  spinning = false,
}: Readonly<CheckDepthSplitButtonProps>) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { projectRef } = useProjectWriteMode();
  const compact = size === "xs";
  const buttonStyle = splitButtonStyle(size);
  const heightClass = compact ? "min-h-[30px]" : "min-h-[36px]";

  return (
    <span className="inline-flex items-center gap-2">
      <Tooltip
        content={
          currentDepth !== null && currentDepth < VISIBILITY_HORIZON
            ? VISIBILITY_SHALLOW_CHECK_COPY
            : null
        }
        semantics="description"
      >
        <ButtonGroup variant="secondary" style={compact ? { height: 30 } : undefined}>
          <Button
            variant="secondary"
            size={size}
            className={heightClass}
            disabled={disabled}
            onClick={onAction}
            startIcon={
              <ArrowsClockwise
                weight="regular"
                className={spinning ? "animate-spin" : ""}
                size={15}
              />
            }
            style={buttonStyle}
          >
            {actionLabel}
          </Button>
          <Button
            aria-label={caretAriaLabel}
            variant="secondary"
            size={size}
            className={heightClass}
            disabled={disabled}
            onClick={(event) => setMenuAnchor(event.currentTarget)}
            style={{ ...buttonStyle, ...caretStyle }}
          >
            <CaretDown aria-hidden size={13} weight="regular" />
          </Button>
        </ButtonGroup>
      </Tooltip>
      <Menu
        anchorEl={menuAnchor}
        onClose={() => setMenuAnchor(null)}
        open={Boolean(menuAnchor)}
        listProps={{ "aria-label": "Check depth", style: { padding: 0 } }}
        contentProps={{ style: menuSelectPaperStyle }}
      >
        {serpDepthValues.map((depth) => (
          <MenuSelectOptionItem
            current={depth === currentDepth}
            key={depth}
            onSelect={() => {
              onDepthChange(depth);
              setMenuAnchor(null);
            }}
            option={{ label: optionLabel(depth), value: String(depth) }}
          />
        ))}
        {projectRef ? (
          <MenuActionFooter>
            <Button
              className="w-full"
              href={settingsSectionHref(projectRef, "tracking")}
              size="xs"
              variant="secondary"
            >
              Change default
            </Button>
          </MenuActionFooter>
        ) : null}
      </Menu>
    </span>
  );
}
