"use client";

import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { useProjectWriteMode } from "@/components/shell/ProjectWriteModeProvider";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { appPath } from "@/lib/routing/app-path";
import { MapPinIcon as MapPin } from "@phosphor-icons/react/dist/csr/MapPin";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

type Props = {
  canCreateKeyword: boolean;
  dialogs: ReactNode;
  marketLabel: string;
  paused?: boolean;
  onAddKeyword: () => void;
  projectRef: string;
};

/**
 * The empty state of ONE market. The project-level empty state answers a different question -
 * "this project tracks nothing yet" - and is left exactly as it was; standing inside a market
 * and being told about the project is what made the old copy misleading. Both ways out are
 * offered because an empty market usually already has a sibling worth copying from.
 */
export function KeywordsGridMarketEmpty({
  canCreateKeyword,
  dialogs,
  marketLabel,
  paused = false,
  onAddKeyword,
  projectRef,
}: Readonly<Props>) {
  const t = useTranslations("projectRankTracker.list.marketEmpty");
  const { readOnly } = useProjectWriteMode();

  return (
    <section className="grid w-full min-w-0 gap-4">
      <EmptyState
        action={
          <div className="flex flex-wrap items-center justify-center gap-2">
            {canCreateKeyword ? (
              <ProjectReadOnlyTooltip>
                <Button disabled={readOnly} onClick={onAddKeyword} type="button">
                  {t("addKeywords", { market: marketLabel })}
                </Button>
              </ProjectReadOnlyTooltip>
            ) : null}
            <Button component={Link} href={appPath(projectRef, "rank-tracker")} variant="secondary">
              {t("copyKeywords")}
            </Button>
          </div>
        }
        description={
          paused
            ? t("pausedDescription", { market: marketLabel })
            : t("description", { market: marketLabel })
        }
        icon={<MapPin size={22} weight="regular" />}
        title={t("title", { market: marketLabel })}
      />
      {dialogs}
    </section>
  );
}
