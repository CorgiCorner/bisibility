"use client";

import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/ui/cn";
import { StarIcon as Star } from "@phosphor-icons/react/dist/csr/Star";
import { useTranslations } from "next-intl";
import type { KeyboardEvent, MouseEvent, Ref } from "react";

export type DefaultProjectStarProps = {
  isDefault: boolean;
  onToggle: () => void;
  projectName: string;
  ref?: Ref<HTMLButtonElement>;
};

function menuRows(button: HTMLElement) {
  const menu = button.closest<HTMLElement>('[role="menu"]');
  return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
}

function ownRow(button: HTMLElement) {
  return button.closest("[data-workspace-row]")?.querySelector<HTMLElement>('[role="menuitem"]');
}

// The star sits beside its row item, not inside it: a menuitem's children are presentational,
// so a nested button would vanish for assistive technology. Arrow keys hand focus back to the
// menu's own roving order; Space and Enter stay here so the menu typeahead never consumes them.
function handleStarKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
  const button = event.currentTarget;
  if (event.key === " " || event.key === "Enter") {
    event.stopPropagation();
    return;
  }
  if (event.key !== "ArrowLeft" && event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
  event.preventDefault();
  event.stopPropagation();
  const row = ownRow(button);
  if (!row || event.key === "ArrowLeft") {
    row?.focus();
    return;
  }
  const rows = menuRows(button);
  const index = rows.indexOf(row);
  const step = event.key === "ArrowDown" ? 1 : -1;
  rows[(index + step + rows.length) % rows.length]?.focus();
}

/**
 * Phosphor's filled weight is reserved for the navigation rail, so the default state keeps the
 * regular outline and fills its interior with a star-shaped accent layer underneath it.
 */
export function DefaultProjectStar({
  isDefault,
  onToggle,
  projectName,
  ref,
}: Readonly<DefaultProjectStarProps>) {
  const t = useTranslations("shell.workspace.defaultProject");
  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    // The row beside the star navigates and closes the menu; the star does neither.
    event.preventDefault();
    event.stopPropagation();
    onToggle();
  }

  return (
    <Tooltip
      content={
        <span className="block text-left">
          <span className="block">{isDefault ? t("isDefault") : t("makeDefault")}</span>
          <span className="block font-normal opacity-80">
            {isDefault ? t("isDefaultDescription") : t("makeDefaultDescription")}
          </span>
        </span>
      }
      placement="top"
      semantics="description"
    >
      <button
        aria-label={t("label", { name: projectName })}
        aria-pressed={isDefault}
        className={cn(
          "relative grid size-6 flex-none place-items-center rounded-control p-0 transition-opacity focus-visible:opacity-100",
          isDefault
            ? "text-accent-solid"
            : "text-fg-muted opacity-0 hover:text-fg group-hover/workspace-row:opacity-100 group-focus-within/workspace-row:opacity-100 [@media(hover:none)]:opacity-100",
        )}
        data-default-star
        onClick={handleClick}
        onKeyDown={handleStarKeyDown}
        ref={ref}
        type="button"
      >
        {isDefault ? (
          <span
            aria-hidden
            className="absolute inset-0 m-auto size-4 bg-current [clip-path:polygon(50%_12%,63%_35%,89%_39%,71%_58%,76%_86%,50%_74%,24%_86%,29%_58%,11%_39%,37%_35%)]"
            data-default-star-fill
          />
        ) : null}
        <Star aria-hidden className="relative" size={16} weight="regular" />
      </button>
    </Tooltip>
  );
}
