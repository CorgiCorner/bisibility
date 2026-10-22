"use client";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { HelpButton } from "@/components/ui/HelpButton";
import { Tooltip } from "@/components/ui/Tooltip";
import type { AiCatalogFailureReason } from "@/lib/ai-research/catalog-types";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useTranslations } from "next-intl";

export function AiSourceRetry({ onRetry }: Readonly<{ onRetry: () => void }>) {
  const t = useTranslations("projectAiResearch");
  return (
    <div className="flex justify-center">
      <Button variant="secondary" size="sm" onClick={onRetry}>
        {t("sourceRetry")}
      </Button>
    </div>
  );
}

export function AiCatalogNotice({
  mode,
  projectId,
  reason,
}: Readonly<{
  mode: "prompt" | "visibility";
  projectId: string;
  reason?: AiCatalogFailureReason;
}>) {
  const t = useTranslations("projectAiResearch");
  const noSource = reason === "no_source";
  return (
    <Card role="alert" className="flex flex-wrap items-center gap-2 text-ui-body text-fg-muted">
      <p className="m-0 min-w-0 flex-1">
        {t(
          noSource
            ? "noSource"
            : mode === "prompt"
              ? "catalogUnavailableLegacy"
              : "catalogUnavailableVisibility",
        )}
      </p>
      {noSource ? (
        <Button asChild variant="outline" size="sm">
          <Link href={appPath(projectId, "integrations")}>{t("openIntegrations")}</Link>
        </Button>
      ) : (
        <Tooltip
          semantics="description"
          placement="top"
          content={t(mode === "prompt" ? "expandedPricingRequirement" : "legacyVisibilityPreset")}
        >
          <HelpButton aria-label={t("catalogHelp")} />
        </Tooltip>
      )}
    </Card>
  );
}
