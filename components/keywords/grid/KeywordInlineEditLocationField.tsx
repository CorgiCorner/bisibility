"use client";

import { LocationField, type LocationFieldValue } from "@/components/keywords/LocationField";
import { useTranslations } from "next-intl";

export function KeywordInlineEditLocationField({
  error,
  keywordId,
  onChange,
  projectId,
  value,
}: Readonly<{
  error?: string;
  keywordId: string;
  onChange: (value: LocationFieldValue) => void;
  projectId: string | null;
  value: LocationFieldValue;
}>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
  return (
    <LocationField
      error={error}
      help={t("inlineLocationHelp")}
      idPrefix={`inline-${keywordId}`}
      label={t("locationLabel")}
      messages={{
        city: t("locationCity"),
        clearSearch: t("locationClearSearch"),
        countries: t("locationCountries"),
        noMatching: t("locationNoMatching"),
        region: t("locationRegion"),
        regionsAndCities: t("locationRegionsAndCities"),
        searching: t("locationSearching"),
      }}
      onChange={onChange}
      placeholder={t("locationPlaceholder")}
      projectId={projectId}
      value={value}
    />
  );
}
