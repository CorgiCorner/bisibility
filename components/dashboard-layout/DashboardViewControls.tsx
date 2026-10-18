"use client";

import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { useMenuExitLifecycle } from "@/components/ui/menu-exit-lifecycle";
import type { DashboardPreset } from "@/lib/dashboard-layout/types";
import { SlidersHorizontalIcon as SlidersHorizontal } from "@phosphor-icons/react/dist/csr/SlidersHorizontal";
import { useTranslations } from "next-intl";
import type { RefObject } from "react";

export function DashboardPresetControl({
  value,
  disabled,
  onChange,
}: Readonly<{
  value: DashboardPreset;
  disabled: boolean;
  onChange: (value: DashboardPreset) => void;
}>) {
  const t = useTranslations("shared.dashboardLayout");
  return (
    <MenuSelect
      value={value}
      ariaLabel={t("preset")}
      disabled={disabled}
      options={(["general", "local", "competitors"] as const).map((preset) => ({
        value: preset,
        label: t(`presets.${preset}`),
      }))}
      onChange={(preset) => {
        if (preset === "general" || preset === "local" || preset === "competitors")
          onChange(preset);
      }}
    />
  );
}

type LayoutControlProps = Readonly<{
  trigger: RefObject<HTMLButtonElement | null>;
  pending: boolean;
  editing: boolean;
  defaultDisabled: boolean;
  onToggleEditing: () => void;
  onSetDefault: () => void;
}>;

function DashboardCustomizationMenu({
  trigger,
  pending,
  defaultDisabled,
  onToggleEditing,
  onSetDefault,
}: LayoutControlProps) {
  const t = useTranslations("shared.dashboardLayout");
  const { anchorEl, closeMenu, handleExited, open, openMenu } = useMenuExitLifecycle(() => {});
  return (
    <>
      <Button
        ref={trigger}
        size="sm"
        variant="outline"
        className="min-w-0 px-2 sm:px-3 [--control-background-color:transparent]"
        disabled={pending}
        aria-label={t("title")}
        aria-haspopup="menu"
        aria-expanded={open}
        startIcon={<SlidersHorizontal aria-hidden size={15} />}
        onClick={(event) => openMenu(event.currentTarget)}
      >
        <span className="hidden sm:inline">{t("title")}</span>
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={closeMenu}
        onExited={handleExited}
        listProps={{ "aria-label": t("title") }}
      >
        <MenuItem
          disabled={pending}
          onSelect={() => {
            closeMenu();
            onToggleEditing();
          }}
        >
          {t("title")}
        </MenuItem>
        <MenuItem
          disabled={defaultDisabled}
          onSelect={() => {
            closeMenu();
            onSetDefault();
          }}
        >
          {t("setDefault")}
        </MenuItem>
      </Menu>
    </>
  );
}

export function DashboardLayoutControl({
  menu = false,
  ...props
}: LayoutControlProps & { menu?: boolean }) {
  const t = useTranslations("shared.dashboardLayout");
  if (menu) return <DashboardCustomizationMenu {...props} />;
  return (
    <>
      <Button
        ref={props.trigger}
        size="sm"
        variant="outline"
        disabled={props.pending}
        aria-expanded={props.editing}
        onClick={props.onToggleEditing}
      >
        {t("title")}
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={props.defaultDisabled}
        onClick={props.onSetDefault}
      >
        {t("setDefault")}
      </Button>
    </>
  );
}
