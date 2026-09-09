import { ConclusionSubtitle } from "@/components/ui/ConclusionSubtitle";
import { SectionTitle } from "@/components/ui/SectionTitle";
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
        <p className="mt-[3px] block min-h-[2lh] font-sans text-[11px] leading-normal text-fg-muted">
          {definition}
        </p>
        <ConclusionSubtitle loading={captionLoading} text={caption} />
      </div>
      {trailing}
    </div>
  );
}
