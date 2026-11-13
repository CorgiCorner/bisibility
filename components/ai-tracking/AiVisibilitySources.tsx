"use client";

import {
  addAiSourcePlanItem,
  clearAiSourceType,
  removeAiSourcePlanItem,
  setAiSourceType,
  updateAiSourcePlanItem,
} from "@/lib/actions/ai-sources";
import type { AiSourceActionResult } from "@/lib/actions/ai-sources-input";
import { overviewFilterHref } from "@/lib/ai-tracking/overview-href";
import type { SourceOverrideType } from "@/lib/ai-tracking/source-types";
import type { AiSourcePlanState, AiVisibilitySourcesLoad } from "@/lib/ai-tracking/sources-model";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AiVisibilitySourcesView } from "./AiVisibilitySourcesView";

export function AiVisibilitySources({
  model,
  projectId,
}: Readonly<{ model: AiVisibilitySourcesLoad; projectId: string }>) {
  const t = useTranslations("projectAiTracking");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(task: () => Promise<AiSourceActionResult>) {
    setPending(true);
    setError(null);
    try {
      const result = await task();
      if (!result.ok) {
        setError(failure(result.error, t));
        return;
      }
      router.refresh();
    } catch {
      setError(t("sources.saveFailed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <AiVisibilitySourcesView
      error={error}
      model={model}
      onAdd={(domain, url) => {
        void run(() => addAiSourcePlanItem({ domain, projectId, url }));
      }}
      onClearType={(domain) => {
        void run(() => clearAiSourceType({ domain, projectId }));
      }}
      onFilter={(filters) => {
        router.push(
          overviewFilterHref(
            pathname,
            new URLSearchParams(searchParams.toString()),
            filters,
            "sources",
          ),
        );
      }}
      onRemove={(domain) => {
        void run(() => removeAiSourcePlanItem({ domain, projectId }));
      }}
      onSetType={(domain, type: SourceOverrideType) => {
        void run(() => setAiSourceType({ domain, projectId, type }));
      }}
      onUpdatePlan={(domain, patch: { note?: string | null; state?: AiSourcePlanState }) => {
        void run(() => updateAiSourcePlanItem({ domain, projectId, ...patch }));
      }}
      pending={pending}
      projectId={projectId}
    />
  );
}

function failure(
  error: "fixed" | "missing" | "url",
  t: ReturnType<typeof useTranslations<"projectAiTracking">>,
) {
  if (error === "fixed") return t("sources.errorFixed");
  if (error === "url") return t("sources.errorUrl");
  return t("sources.saveFailed");
}
