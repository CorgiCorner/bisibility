import {
  EmptyModuleCard,
  EmptyModuleLabel,
} from "@/components/keyword-detail/empty/empty-state-primitives";
import { WarningIcon as Warning } from "@phosphor-icons/react/ssr";

export type TargetMismatchCannibalizationProps = {
  expectedPath?: string;
  rankingPath?: string;
  rankingUrlCount?: number;
};

export function TargetMismatchCannibalization({
  expectedPath = "/headless-cms",
  rankingPath = "/blog/headless-cms-guide",
  rankingUrlCount = 2,
}: Readonly<TargetMismatchCannibalizationProps>) {
  const visibleUrlCount = Math.max(1, Math.round(rankingUrlCount));

  return (
    <EmptyModuleCard className="flex min-h-[196px] flex-col">
      <EmptyModuleLabel>Ranking URL</EmptyModuleLabel>
      <p className="m-0 mt-3 break-all font-sans tabular-nums text-[15px] font-semibold text-fg">
        {rankingPath}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-fg-muted">
        <span className="inline-flex items-center gap-1 rounded-full bg-[color-mix(in_srgb,var(--yellow)_16%,transparent)] px-2 py-1 font-sans tabular-nums text-[9.5px] font-semibold text-yellow-text">
          <Warning aria-hidden size={11} weight="regular" />
          Target mismatch
        </span>
        <span>
          Expected{" "}
          <code className="font-sans tabular-nums text-[10.5px] text-fg">{expectedPath}</code>
        </span>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-5 text-[11px] text-fg-muted">
        <span className="font-sans tabular-nums">{visibleUrlCount} URLs ranking</span>
        <span className="inline-flex items-center gap-1 font-sans tabular-nums font-semibold text-yellow-text">
          <Warning aria-hidden size={11} weight="regular" />
          Cannibalization
        </span>
      </div>
    </EmptyModuleCard>
  );
}
