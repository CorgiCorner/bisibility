"use client";

import { Button } from "@/components/ui/Button";
import { MenuSelect } from "@/components/ui/MenuSelect";
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

export function DashboardLayoutControl({
  trigger,
  pending,
  editing,
  onToggleEditing,
}: Readonly<{
  trigger: RefObject<HTMLButtonElement | null>;
  pending: boolean;
  editing: boolean;
  onToggleEditing: () => void;
}>) {
  const t = useTranslations("shared.dashboardLayout");
  return (
    <Button
      ref={trigger}
      size="sm"
      variant="outline"
      className="min-w-0 px-2 font-normal sm:px-3 [--control-background-color:transparent]"
      disabled={pending}
      aria-label={t("title")}
      aria-haspopup="dialog"
      aria-expanded={editing}
      startIcon={<SlidersHorizontal weight="regular" aria-hidden size={15} />}
      onClick={onToggleEditing}
    >
      <span className="hidden sm:inline">{t("title")}</span>
    </Button>
  );
}
