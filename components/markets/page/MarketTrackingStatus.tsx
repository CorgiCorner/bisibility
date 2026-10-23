"use client";

import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { StatusChip } from "@/components/ui/StatusChip";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

export function MarketTrackingStatus({
  active,
  canEdit,
  name,
  onChange,
}: Readonly<{
  active: boolean;
  canEdit: boolean;
  name: string;
  onChange: (enabled: boolean) => void;
}>) {
  const t = useTranslations("projectMarkets");
  const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
  const menuId = useId();
  const label = active ? t("active") : t("paused");
  if (!canEdit) return <StatusChip label={label} tone={active ? "positive" : "neutral"} />;
  return (
    <>
      <Button
        aria-label={t("trackingStatusFor", { market: name, status: label })}
        aria-controls={anchor ? menuId : undefined}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        variant="ghost"
        size="xs"
        className="gap-1.5 px-2"
        onClick={(event) => setAnchor(event.currentTarget)}
      >
        <StatusChip label={label} tone={active ? "positive" : "neutral"} />
        <CaretDownIcon weight="regular" aria-hidden size={12} />
      </Button>
      <Menu
        id={menuId}
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        contentProps={{ className: "min-w-44 p-1.5" }}
      >
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onChange(!active);
          }}
        >
          {active ? t("pauseTracking") : t("resumeTracking")}
        </MenuItem>
      </Menu>
    </>
  );
}
