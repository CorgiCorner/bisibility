import { EmptyState } from "@/components/ui/EmptyState";
import { ChartLineUpIcon } from "@phosphor-icons/react/dist/ssr/ChartLineUp";
import type { ReactNode } from "react";

export function DashboardEmptyBody({
  title,
  description,
}: Readonly<{ title: string; description?: ReactNode }>) {
  return (
    <div className="grid min-h-[244px] flex-1 place-items-center" data-dashboard-empty>
      <EmptyState
        compact
        title={title}
        description={description}
        icon={<ChartLineUpIcon aria-hidden size={20} weight="regular" />}
      />
    </div>
  );
}
