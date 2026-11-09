"use client";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import type { SerpFeaturePresentation } from "@/lib/checks/serp-feature-presentation";
import { MapPinIcon } from "@phosphor-icons/react/dist/csr/MapPin";
import { SparkleIcon } from "@phosphor-icons/react/dist/csr/Sparkle";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { AiOverviewContent } from "./AiOverviewContent";
import { LocalPackDetails } from "./LocalPackDetails";

export function SerpFeatureSummary({ features }: { features: SerpFeaturePresentation }) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  const [opened, setOpened] = useState<"aiOverview" | "localPack" | null>(null);
  const ai = features.aiOverview;
  const local = features.localPack;
  return (
    <>
      <div className="grid gap-2 border-b border-border px-5 py-3">
        {(["aiOverview", "localPack"] as const).map((kind) => {
          const present = features[kind].present;
          return (
            <div key={kind} className="flex min-w-0 items-center gap-2 text-xs">
              {kind === "aiOverview" ? (
                <SparkleIcon size={16} aria-hidden />
              ) : (
                <MapPinIcon size={16} aria-hidden />
              )}
              <span className="font-medium">{t(`features.${kind}.label`)}</span>
              <span className="min-w-0 flex-1 text-fg-muted">
                {t(present ? "featureRecorded" : "featureNotRecorded")}
              </span>
              {present ? (
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => setOpened(kind)}
                  aria-label={t("featureDetailsLabel", { feature: t(`features.${kind}.label`) })}
                >
                  {t("featureDetails")}
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>
      <Modal
        open={opened !== null}
        onClose={() => setOpened(null)}
        title={opened ? t(`features.${opened}.label`) : ""}
      >
        {opened === "aiOverview" ? (
          <AiOverviewContent ai={ai} />
        ) : (
          <LocalPackDetails local={local} />
        )}
      </Modal>
    </>
  );
}
