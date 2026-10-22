"use client";

import { settingsSectionHref } from "@/components/settings/shell/settings-sections";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button, buttonXsStyle } from "@/components/ui/Button";
import { ButtonGroup } from "@/components/ui/ButtonGroup";
import { Menu } from "@/components/ui/Menu";
import { MenuActionFooter } from "@/components/ui/MenuActionFooter";
import { menuSelectPaperStyle } from "@/components/ui/MenuSelect";
import { MenuSelectOptionItem } from "@/components/ui/MenuSelectOptionItem";
import { Tooltip } from "@/components/ui/Tooltip";
import { type SerpDepth, serpDepthValues } from "@/lib/serp/constants";
import { VISIBILITY_HORIZON } from "@/lib/visibility/definition";
import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/dist/csr/ArrowsClockwise";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/dist/csr/CaretDown";
import { useTranslations } from "next-intl";
import { useState } from "react";

export type CheckDepthSplitButtonSize = "md" | "xs";

type CheckDepthSplitButtonProps = {
  actionLabel: string;
  compactActionLabel?: string;
  caretAriaLabel?: string;
  copy?: CheckDepthSplitButtonCopy;
  currentDepth: SerpDepth | null;
  disabled?: boolean;
  /** Where the depth menu opens; a control docked at the bottom of the screen opens it upward. */
  menuSide?: "bottom" | "top";
  onAction: () => void;
  onDepthChange: (depth: SerpDepth) => void;
  optionLabel?: (depth: SerpDepth) => string;
  size?: CheckDepthSplitButtonSize;
  spinning?: boolean;
  variant?: "primary" | "secondary";
};

export type CheckDepthSplitButtonCopy = {
  changeDefault: string;
  depthMenu: string;
  optionLabel: (depth: SerpDepth) => string;
  shallowVisibility: string;
};

const caretStyle = { minWidth: 34, paddingLeft: 6, paddingRight: 6 } as const;

function splitButtonStyle(size: CheckDepthSplitButtonSize, variant: "primary" | "secondary") {
  return {
    ...(size === "xs" ? buttonXsStyle : { minHeight: 36 }),
    ...(variant === "secondary"
      ? {
          "--control-background-color": "var(--button-secondary-hover-bg)",
          "--control-hover-background-color":
            "color-mix(in srgb, var(--fg) 6%, var(--button-secondary-hover-bg))",
        }
      : {}),
  };
}

export function CheckDepthSplitButton({
  actionLabel,
  compactActionLabel,
  caretAriaLabel,
  copy,
  currentDepth,
  disabled = false,
  menuSide = "bottom",
  onAction,
  onDepthChange,
  optionLabel: optionLabelOverride,
  size = "md",
  spinning = false,
  variant = "secondary",
}: Readonly<CheckDepthSplitButtonProps>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.runChecks");
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const { projectRef } = useProjectWriteMode();
  const compact = size === "xs";
  const buttonStyle = splitButtonStyle(size, variant);
  const heightClass = compact ? "min-h-[30px]" : "min-h-[36px]";
  // Feature callers can own presentation without requiring the shared control to load a
  // feature catalog. Existing callers retain their narrow, message-free default.
  const optionLabel = copy?.optionLabel ?? optionLabelOverride ?? ((depth) => t("top", { depth }));

  return (
    <span className="inline-flex items-center gap-2">
      <Tooltip
        content={
          currentDepth !== null && currentDepth < VISIBILITY_HORIZON
            ? (copy?.shallowVisibility ?? t("shallowVisibility"))
            : null
        }
        semantics="description"
      >
        <ButtonGroup variant={variant} style={compact ? { height: 30 } : undefined}>
          <Button
            aria-label={compactActionLabel ? actionLabel : undefined}
            variant={variant}
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
            {compactActionLabel ? (
              <>
                <span className="sm:hidden" aria-hidden>
                  {compactActionLabel}
                </span>
                <span className="hidden sm:inline" aria-hidden>
                  {actionLabel}
                </span>
              </>
            ) : (
              actionLabel
            )}
          </Button>
          <Button
            aria-label={caretAriaLabel ?? t("chooseDepth")}
            variant={variant}
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
        side={menuSide}
        listProps={{ "aria-label": copy?.depthMenu ?? t("depthMenu"), style: { padding: 0 } }}
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
              variant={variant}
            >
              {copy?.changeDefault ?? t("changeDefault")}
            </Button>
          </MenuActionFooter>
        ) : null}
      </Menu>
    </span>
  );
}
