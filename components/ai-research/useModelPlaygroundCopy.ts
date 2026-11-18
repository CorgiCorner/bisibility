import type { ModelPlaygroundCopy } from "@/lib/model-playground/composer-copy";
import { useTranslations } from "next-intl";

export function useModelPlaygroundCopy(copy: ModelPlaygroundCopy) {
  const t = useTranslations("projectAiResearch");
  return {
    ...copy,
    addModel: t("modelPlayground.addModel"),
    estimate: t("modelPlayground.costEstimate"),
    limits: t("modelPlayground.compareLimit"),
    lead: t("modelPlayground.lead"),
    fundingCredits: t("modelPlayground.fundingCredits"),
    fundingOwnKey: t("modelPlayground.fundingOwnKey"),
    spendNotice: t("modelPlayground.spendNotice"),
    prompt: t("modelPlayground.promptLabel"),
    language: t("responseLanguage"),
    webSearch: t("webSearchLabel"),
    remove: t("modelPlayground.remove"),
    run: t("modelPlayground.run"),
  };
}
