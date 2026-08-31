import { InfoTooltip } from "@/components/ui";
import type { ReactNode } from "react";

type Props = {
  actionError?: ReactNode;
  analyticsNotice?: ReactNode;
  analyticsOption?: ReactNode;
  cards: ReactNode;
  credentials: ReactNode;
  hidden: ReactNode;
  providerError?: ReactNode;
  showHeading?: boolean;
};
export function StepConnectProviderEditor({
  actionError,
  analyticsNotice,
  analyticsOption,
  cards,
  credentials,
  hidden,
  providerError,
  showHeading = true,
}: Readonly<Props>) {
  return (
    <>
      {hidden}
      {showHeading ? (
        <div className="text-lg font-semibold tracking-[-0.4px]">Connect data</div>
      ) : null}
      {cards}
      {providerError}
      {credentials}
      {actionError}
      {analyticsOption ? (
        <div className="mt-5.5">
          <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
            Your site&apos;s data / optional, free
            <InfoTooltip text="Search Console shows the queries your site already ranks for. Free import for keyword suggestions; it cannot check rankings." />
          </div>
          {analyticsNotice}
          <div className="mt-2 grid grid-cols-1 items-stretch gap-3">{analyticsOption}</div>
        </div>
      ) : null}
    </>
  );
}
