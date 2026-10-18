"use client";
import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import { Tooltip } from "@/components/ui/Tooltip";
import type { BadgeKind } from "@/lib/achievements/progress";
import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { DotsThreeIcon } from "@phosphor-icons/react/dist/csr/DotsThree";
import { DownloadSimpleIcon } from "@phosphor-icons/react/dist/csr/DownloadSimple";
import { useTranslations } from "next-intl";
import { useState } from "react";
import styles from "./achievements.module.css";

export function AchievementActionsMenu({
  kind,
  onReplay,
}: {
  kind: BadgeKind;
  onReplay: () => void;
}) {
  const t = useTranslations("account.achievements");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Tooltip content={t("badgeOptions")}>
        <Button
          size="xs"
          variant="ghost"
          className="min-w-0 w-8 shrink-0 p-0"
          aria-label={t("badgeOptions")}
          aria-haspopup="menu"
          aria-expanded={!!anchor}
          onClick={(e) => setAnchor(e.currentTarget)}
        >
          <DotsThreeIcon size={20} />
        </Button>
      </Tooltip>
      <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} align="end">
        <MenuItem
          className="min-h-10 gap-3"
          component="a"
          href={`/api/achievements/badge/${kind}`}
          download={`bisibility-${kind}.png`}
          onSelect={() => setAnchor(null)}
        >
          <DownloadSimpleIcon size={16} className="shrink-0" aria-hidden />
          {t("download")}
        </MenuItem>
        <MenuItem
          className={`${styles.replay} min-h-10 gap-3`}
          onSelect={() => {
            setAnchor(null);
            onReplay();
          }}
        >
          <ArrowClockwiseIcon size={16} className="shrink-0" aria-hidden />
          {t("replay")}
        </MenuItem>
      </Menu>
    </>
  );
}
