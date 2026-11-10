"use client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { KnownFeature } from "@/lib/checks/retrieved-results-model";
import type { SerpFeaturePresentation } from "@/lib/checks/serp-feature-presentation";
import type { UrlRepairTarget } from "@/lib/serp-url-repair/model";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AiOverviewContent } from "./AiOverviewContent";
import { FetchAiOverview } from "./FetchAiOverview";
import { LocalPackDetails } from "./LocalPackDetails";
import { SerpFeatureIcon } from "./SerpFeatureIcon";
import { SerpRichFeatureDetails } from "./SerpRichFeatureDetails";

type Kind = KnownFeature | "other";
export function SerpFeatureSummary({
  features,
  comparisonKinds = [],
  aiFetchContext,
}: {
  features: SerpFeaturePresentation;
  comparisonKinds?: readonly Kind[];
  aiFetchContext?: { projectRef: string; target: UrlRepairTarget };
}) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  const [opened, setOpened] = useState<Kind | null>(null);
  const rich = features.richFeatures ?? [];
  const kinds = [
    ...new Set<Kind>(["aiOverview", "localPack", ...comparisonKinds, ...rich.map((x) => x.kind)]),
  ];
  const label = (kind: Kind) =>
    kind === "other" ? t("otherFeatures") : t(`features.${kind}.label`);
  const openedRich = rich.find((x) => x.kind === opened);
  // A SerpApi overview can arrive as a marker only; its content needs a separate request.
  const overviewLoadable =
    Boolean(aiFetchContext) &&
    features.aiOverview.present &&
    !features.aiOverview.paragraphs.length &&
    !features.aiOverview.sections?.length;
  return (
    <>
      <div
        className="grid gap-1 border-b border-border px-5 py-3"
        aria-label={t("serpFeaturesTitle")}
      >
        {kinds.map((kind) => {
          const feature = rich.find((x) => x.kind === kind);
          const present =
            kind === "aiOverview"
              ? features.aiOverview.present
              : kind === "localPack"
                ? features.localPack.present
                : Boolean(feature);
          const loadable = kind === "aiOverview" && overviewLoadable;
          return (
            <div
              key={kind}
              className="grid min-h-10 min-w-0 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2.5 text-xs"
            >
              <SerpFeatureIcon kind={kind} />
              <div className="min-w-0">
                <span className="font-medium">{label(kind)}</span>
                <span className="ml-2 text-fg-muted">
                  {loadable
                    ? t("overviewFetch.notLoaded")
                    : t(present ? "featureRecorded" : "featureNotRecorded")}
                </span>
              </div>
              {present ? (
                <Button
                  size="xs"
                  variant="outline"
                  className="min-h-10 sm:min-h-0"
                  onClick={() => setOpened(kind)}
                  aria-label={
                    loadable ? undefined : t("featureDetailsLabel", { feature: label(kind) })
                  }
                >
                  {t(loadable ? "overviewFetch.load" : "featureDetails")}
                </Button>
              ) : (
                <span className="w-14" aria-hidden />
              )}
            </div>
          );
        })}
      </div>
      <Modal
        open={opened !== null}
        onClose={() => setOpened(null)}
        title={opened ? label(opened) : ""}
        size="lg"
      >
        {opened === "aiOverview" ? (
          <div className="space-y-4">
            <AiOverviewContent ai={features.aiOverview} />
            {aiFetchContext && overviewLoadable ? <FetchAiOverview {...aiFetchContext} /> : null}
          </div>
        ) : opened === "localPack" ? (
          <LocalPackDetails local={features.localPack} />
        ) : openedRich ? (
          <SerpRichFeatureDetails feature={openedRich} />
        ) : null}
      </Modal>
    </>
  );
}
