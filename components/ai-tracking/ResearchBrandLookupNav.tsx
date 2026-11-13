"use client";

import { BackLink } from "@/components/ui/BackLink";
import { aiVisibilityTabHref } from "@/lib/ai-tracking/ai-visibility-paths";
import { useTranslations } from "next-intl";

export function ResearchBrandLookupNav({ projectId }: Readonly<{ projectId: string }>) {
  const t = useTranslations("projectAiTracking.research");
  return (
    <div className="grid gap-2">
      <BackLink href={aiVisibilityTabHref(projectId, "research")}>{t("backToQuestions")}</BackLink>
      <p className="m-0 text-ui-body text-fg-muted">{t("brandLookupHint")}</p>
    </div>
  );
}
