"use client";
import type { RetrievedResults } from "@/lib/checks/contract";
import { serpFeaturePresentation } from "@/lib/checks/serp-feature-presentation";
import { SerpFeatureSummary } from "./SerpFeatureSummary";
export function RetrievedAiOverview({
  results,
  projectRef,
}: {
  projectRef?: string;
  results: Extract<RetrievedResults, { tier: "full" }>;
}) {
  const features = results.featureSummary ?? serpFeaturePresentation([], results.features);
  if (!results.featureSummary && results.aiOverview === true) {
    features.aiOverview = {
      present: true,
      paragraphs: results.aiOverviewContent?.paragraphs ?? [],
      sources: results.aiOverviewContent?.sources ?? [],
    };
  }
  return (
    <SerpFeatureSummary
      features={features}
      aiFetchContext={
        projectRef && results.provider === "serpapi"
          ? { projectRef, target: { kind: "check", checkId: results.checkId } }
          : undefined
      }
    />
  );
}
