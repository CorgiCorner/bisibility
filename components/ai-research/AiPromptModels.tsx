"use client";
import type { AiResearchCatalog } from "@/lib/ai-research/catalog-types";
import { useTranslations } from "next-intl";
import { AiModelSelect } from "./AiCostPolicyFields";

export function AiPromptModels({
  catalog,
  actual,
  disabled,
  models,
  onChange,
}: Readonly<{
  catalog?: AiResearchCatalog;
  actual: boolean;
  disabled: boolean;
  models: string[];
  onChange: (index: number, value: string) => void;
}>) {
  const t = useTranslations("projectAiResearch");
  return (
    <>
      {[0, 1].map((index) => (
        <div className="grid gap-2 text-ui-body" key={index}>
          <span>{t(index === 0 ? "firstModel" : "secondModel")}</span>
          <AiModelSelect
            catalog={catalog}
            actual={actual}
            disabled={disabled}
            index={index}
            models={models}
            onChange={(value) => onChange(index, value)}
          />
        </div>
      ))}
    </>
  );
}
