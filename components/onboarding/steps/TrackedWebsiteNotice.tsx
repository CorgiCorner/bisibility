"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { formatDate } from "@/lib/dates/format";
import { useTranslations } from "next-intl";

export function TrackedWebsiteNotice({
  domain,
  since,
}: Readonly<{ domain: string; since: string }>) {
  const dateFormat = useDateFormat();
  const t = useTranslations("onboarding.website");
  const date = formatDate(since.slice(0, 10), dateFormat);
  return (
    <div className="mt-5.5 max-w-[440px]" role="status">
      <p className="m-0 text-sm font-medium">{t("trackingStarted", { date, domain })}</p>
      <p className="m-0 mt-2 text-[13px] text-fg-muted">{t("trackingStartedDescription")}</p>
    </div>
  );
}
