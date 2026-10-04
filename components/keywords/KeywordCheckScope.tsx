"use client";

import { CountryFlag } from "@/components/ui/CountryFlag";
import { languageDisplayName, regionDisplayName } from "@/lib/i18n/display-names";
import type { KeywordRow } from "@/lib/queries/keywords";
import { DesktopIcon as Desktop } from "@phosphor-icons/react/dist/csr/Desktop";
import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/dist/csr/DeviceMobile";
import { useLocale, useTranslations } from "next-intl";

export function KeywordCheckScope({
  keyword,
  marketLabel,
}: Readonly<{
  keyword: Pick<KeywordRow, "location" | "device" | "engine">;
  marketLabel?: string;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.context");
  const locale = useLocale();
  const mobile = keyword.device.toLowerCase() === "mobile";
  const DeviceIcon = mobile ? DeviceMobile : Desktop;
  return (
    <div
      aria-label={t("label")}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] leading-5 text-fg-muted"
    >
      <span className="inline-flex min-w-0 items-center gap-2">
        {!marketLabel ? (
          <CountryFlag
            code={keyword.location.countryCode}
            className="h-3.5 w-5 shrink-0 rounded-sm"
          />
        ) : null}
        <span className="font-medium text-fg">
          {marketLabel ??
            regionDisplayName(keyword.location.countryCode, keyword.location.displayName, locale)}
        </span>
        {!marketLabel ? (
          <span>
            {languageDisplayName(
              keyword.location.hl,
              keyword.location.languageLabel ?? keyword.location.hl,
              locale,
            )}
          </span>
        ) : null}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <DeviceIcon aria-hidden size={15} weight="regular" />
        {t(mobile ? "mobile" : "desktop")}
      </span>
      <span>{keyword.engine}</span>
    </div>
  );
}
