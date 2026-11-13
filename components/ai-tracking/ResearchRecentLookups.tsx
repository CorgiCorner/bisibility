"use client";

import { Button } from "@/components/ui/Button";
import { Menu } from "@/components/ui/Menu";
import { MenuItem } from "@/components/ui/MenuItem";
import type { ResearchRecentLookup } from "@/lib/ai-research/research-tab-model";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";

export function ResearchRecentLookups({
  projectId,
  recent,
}: Readonly<{ projectId: string; recent: readonly ResearchRecentLookup[] }>) {
  const t = useTranslations("projectAiTracking.research");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button
        aria-expanded={Boolean(anchor)}
        aria-haspopup="menu"
        onClick={(event) => setAnchor(event.currentTarget)}
        size="sm"
        variant="secondary"
      >
        {t("recentLookups")}
      </Button>
      <Menu anchorEl={anchor} onClose={() => setAnchor(null)} open={Boolean(anchor)}>
        {recent.length ? (
          recent.map((lookup) => (
            <MenuItem
              component={Link}
              href={appPath(asProjectRef(projectId), "agent-reports", lookup.id)}
              key={lookup.id}
              onSelect={() => setAnchor(null)}
            >
              <span className="grid min-w-0">
                <span className="truncate">{lookup.title}</span>
                <span className="text-ui-caption text-fg-muted">
                  {lookup.createdAt.slice(0, 10)}
                </span>
              </span>
            </MenuItem>
          ))
        ) : (
          <p className="m-0 px-3 py-2 text-ui-caption text-fg-muted">{t("recentEmpty")}</p>
        )}
      </Menu>
    </>
  );
}
