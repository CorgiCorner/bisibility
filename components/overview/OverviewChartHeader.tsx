import { ConclusionSubtitle, InfoTooltip, SectionTitle } from "@/components/ui";
import type { ReactNode } from "react";

type OverviewChartHeaderProps = {
  caption?: string | null;
  captionLoading?: boolean;
  definition: string;
  title: string;
  trailing?: ReactNode;
};

export function OverviewChartHeader({
  caption,
  captionLoading = false,
  definition,
  title,
  trailing,
}: Readonly<OverviewChartHeaderProps>) {
  return (
    <div className="flex min-h-[69px] items-start justify-between gap-3" data-overview-chart-header>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <SectionTitle className="flex-none">{title}</SectionTitle>
          <InfoTooltip text={definition} />
        </div>
        <ConclusionSubtitle loading={captionLoading} text={caption} />
      </div>
      {trailing}
    </div>
  );
}
