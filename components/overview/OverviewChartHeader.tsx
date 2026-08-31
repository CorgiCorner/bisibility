import { ConclusionSubtitle, MonoText, SectionTitle } from "@/components/ui";
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
    <div className="flex min-h-[96px] items-start justify-between gap-3" data-overview-chart-header>
      <div className="min-w-0">
        <SectionTitle>{title}</SectionTitle>
        <MonoText className="mt-[3px] block min-h-[2lh]" component="p" muted size="sm">
          {definition}
        </MonoText>
        <ConclusionSubtitle loading={captionLoading} text={caption} />
      </div>
      {trailing}
    </div>
  );
}
