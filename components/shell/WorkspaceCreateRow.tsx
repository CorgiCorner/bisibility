"use client";

import { MENU_ROW_STYLE } from "@/components/shell/WorkspaceRow";
import { MenuItem } from "@/components/ui/MenuItem";
import { Tooltip } from "@/components/ui/Tooltip";
import { openSupport } from "@/lib/support/open-support";
import { PlusIcon as Plus } from "@phosphor-icons/react/dist/csr/Plus";
import Link from "next/link";
import { useTranslations } from "next-intl";

/** The account already owns as many projects as it may. */
export type WorkspaceProjectLimit = { canContactSupport: boolean; limit: number };

type WorkspaceCreateRowProps = {
  description: string;
  label: string;
  onSelect: () => void;
  projectLimit: WorkspaceProjectLimit | null;
};

export function WorkspaceCreateRow({
  description,
  label,
  onSelect,
  projectLimit,
}: Readonly<WorkspaceCreateRowProps>) {
  const t = useTranslations("shell.workspace");
  const blocked = projectLimit !== null;
  const content = (
    <>
      <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-control text-fg-muted">
        <Plus aria-hidden size={14} weight="regular" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block text-[13px] font-medium leading-tight ${blocked ? "text-fg-muted" : "text-fg"}`}
        >
          {label}
        </span>
        <span className="mt-px block text-[10px] text-fg-muted">
          {blocked ? t("limitReached", { limit: projectLimit.limit }) : description}
        </span>
      </span>
    </>
  );
  if (!blocked) {
    return (
      <MenuItem
        aria-label={label}
        component={Link}
        href="/onboarding?new=1"
        onClick={onSelect}
        style={MENU_ROW_STYLE}
      >
        {content}
      </MenuItem>
    );
  }
  const canContactSupport = projectLimit.canContactSupport;
  const row = (
    <MenuItem
      aria-disabled={canContactSupport ? undefined : true}
      aria-label={label}
      className="w-full"
      data-disabled=""
      data-testid="workspace-create-blocked"
      onKeyDown={(event) => {
        if (!canContactSupport && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
        }
      }}
      onSelect={
        canContactSupport
          ? () => {
              onSelect();
              openSupport({ message: t("limitSupportMessage", { limit: projectLimit.limit }) });
            }
          : undefined
      }
      style={{
        ...MENU_ROW_STYLE,
        cursor: canContactSupport ? "pointer" : "not-allowed",
        pointerEvents: "auto",
      }}
      textValue={label}
    >
      {content}
    </MenuItem>
  );
  // Without an in-app support channel the row only states the limit.
  if (!canContactSupport) return row;
  // The menu is modal, so the tooltip only explains; selecting the row opens support.
  return (
    <Tooltip
      content={t("limitHelp", { limit: projectLimit.limit })}
      placement="bottom"
      semantics="description"
      wrapperClassName="flex w-full"
    >
      {row}
    </Tooltip>
  );
}
