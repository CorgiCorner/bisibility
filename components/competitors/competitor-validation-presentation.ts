import type { useTranslations } from "next-intl";

type CompetitorTranslations = ReturnType<typeof useTranslations<"projectCompetitors.ui">>;

/** Map local schema details at the form boundary without exposing an unknown schema message. */
export function presentCompetitorValidationMessage(message: string, t: CompetitorTranslations) {
  if (message === "Add a domain.") return t("domainRequired");
  if (message === "Use a valid bare domain." || message === "Use a normalized bare domain.") {
    return t("domainInvalid");
  }
  if (message === "Add a label.") return t("labelRequired");
  if (message === "Keep the label under 80 characters.") return t("labelTooLong");
  if (message === "Aliases cannot be empty.") return t("aliasesEmpty");
  if (message === "Aliases must be unique.") return t("aliasesUnique");
  return t("invalidField");
}
