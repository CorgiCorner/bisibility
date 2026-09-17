"use client";

import { PrivacyChoicesLink } from "@/components/analytics/PrivacyChoicesLink";
import { useTranslations } from "next-intl";
import { AccountSection } from "./AccountSection";

export function AccountPrivacyChoices() {
  const t = useTranslations("account.privacy");

  return (
    <AccountSection description={t("description")} title={t("title")}>
      <PrivacyChoicesLink label={t("action")} />
    </AccountSection>
  );
}
