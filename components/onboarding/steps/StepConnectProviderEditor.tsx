import { OnboardingDataSourceSlot } from "@/components/settings/AccountDataSourceSlot";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("onboarding.provider");
  return (
    <>
      {hidden}
      {showHeading ? (
        <div className="mb-7">
          <h2 className="m-0 text-lg font-semibold tracking-[-0.4px]">{t("title")}</h2>
          <p className="m-0 mt-2 text-[13px] leading-relaxed text-fg-muted">{t("description")}</p>
        </div>
      ) : null}
      <OnboardingDataSourceSlot>
        {cards}
        {providerError}
        {credentials}
        {actionError}
      </OnboardingDataSourceSlot>
      {analyticsOption ? (
        <div className="mt-8 border-t border-border pt-6">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.5px] text-fg-muted">
            {t("searchConsole.label")}
            <InfoTooltip text={t("searchConsole.tooltip")} />
          </div>
          {analyticsNotice}
          <div className="mt-2 grid grid-cols-1 items-stretch gap-3">{analyticsOption}</div>
        </div>
      ) : null}
    </>
  );
}
