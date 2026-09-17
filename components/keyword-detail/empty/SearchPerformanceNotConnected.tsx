import {
  EmptyModuleCard,
  EmptyModuleTitle,
} from "@/components/keyword-detail/empty/empty-state-primitives";
import { useTranslations } from "next-intl";

export type SearchPerformanceNotConnectedProps = {
  connectHref?: string;
};

export function SearchPerformanceNotConnected({
  connectHref = "/app/integrations",
}: Readonly<SearchPerformanceNotConnectedProps>) {
  const t = useTranslations("projectRankTracker.keywordDetail.empty");
  return (
    <EmptyModuleCard>
      <div className="flex flex-wrap items-center gap-2">
        <EmptyModuleTitle>{t("searchPerformance")}</EmptyModuleTitle>
        <span className="inline-flex h-6 items-center rounded-full border border-border bg-bg-sunken px-2.5 font-sans tabular-nums text-[10.5px] text-fg-muted">
          {t("searchConsole")}
        </span>
      </div>
      <p className="m-0 mt-1 text-[12px] text-fg-muted">{t("trailingDays", { days: 28 })}</p>
      <div className="mt-4 rounded-control border border-dashed border-border bg-bg-sunken px-4 py-5">
        <p className="m-0 text-[13px] leading-[1.5] text-fg-muted">{t("connectDescription")}</p>
        <a
          className="mt-2 inline-flex text-[13px] font-semibold text-accent-text hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-solid"
          href={connectHref}
        >
          {t("connect")}
        </a>
      </div>
    </EmptyModuleCard>
  );
}
