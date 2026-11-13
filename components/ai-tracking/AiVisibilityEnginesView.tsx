"use client";

import { AiVisibilityTabs } from "@/components/ai-tracking/AiVisibilityTabs";
import { aiVisibilityBlocks } from "@/components/tracking-loading/ai-visibility-layout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { AiProjectEngineActionResult } from "@/lib/actions/ai-project-engines-input";
import type { EnginesPageModel, EnginesTableRow } from "@/lib/ai-tracking/engines-model";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { engineColumns } from "./AiVisibilityEnginesCells";
import { overviewEngineCopy, overviewProviderLabel } from "./overview-labels";

export function AiVisibilityEnginesView({
  model,
  onToggle,
  projectId,
  providersHref,
  rankHref,
}: Readonly<{
  model: EnginesPageModel;
  onToggle: (input: {
    enabled: boolean;
    engine: "chat_gpt" | "claude" | "gemini" | "google" | "perplexity";
    projectId: string;
    source: "consumer_scrape" | "google_aio" | "model_api";
  }) => Promise<AiProjectEngineActionResult>;
  projectId: string;
  providersHref: string;
  rankHref: string;
}>) {
  const t = useTranslations("projectAiTracking");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const labels = overviewEngineCopy((key) => t(key));
  const provider = model.providers[0] ?? null;

  async function change(
    row: Extract<EnginesTableRow, { availability: "toggle" }>,
    enabled: boolean,
  ) {
    setError(null);
    setPending(true);
    try {
      const result = await onToggle({
        enabled,
        engine: row.engine,
        projectId,
        source: row.source,
      });
      if (result.ok) router.refresh();
      else setError(t("enginesTab.unavailable"));
    } catch {
      setError(t("couldNotSaveChanges"));
    } finally {
      setPending(false);
    }
  }

  const columns = engineColumns({
    canWrite: model.canWrite,
    change,
    labels,
    locale,
    pending,
    provider,
    providersHref,
    rankHref,
    t,
  });

  return (
    <div
      className="flex min-w-0 flex-col gap-5"
      data-visibility-blocks={aiVisibilityBlocks.engines.join(" ")}
      data-visibility-tab="engines"
    >
      <AiVisibilityTabs active="engines" projectId={projectId} />
      <p className="m-0 max-w-3xl text-ui-body">{t("enginesTab.lead")}</p>
      {error ? <p className="m-0 text-sm text-danger">{error}</p> : null}
      <section className="flex flex-col gap-3">
        <h2 className="m-0 font-sans text-ui-section">{t("enginesTab.title")}</h2>
        <div className="min-w-0 overflow-hidden rounded-card border border-border">
          <DataTable
            ariaLabel={t("enginesTab.title")}
            bordered={false}
            columns={columns}
            density="compact"
            id="ai-visibility-engine-choices"
            onSortingChange={() => undefined}
            renderSection={(row) =>
              row.kind === "section"
                ? t(row.group === "consumer" ? "enginesTab.groupConsumer" : "enginesTab.groupModel")
                : null
            }
            rowClassName={(row) =>
              row.kind === "row" && row.availability === "unavailable" ? "text-fg-muted" : ""
            }
            rows={model.rows}
            sorting={null}
          />
        </div>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 font-sans text-ui-section">{t("enginesTab.providersTitle")}</h2>
          {model.providers.map((item) => (
            <div className="flex flex-col gap-1" key={item.id}>
              <p className="m-0 text-sm font-semibold">{overviewProviderLabel(item.id)}</p>
              <p className="m-0 text-sm text-fg-muted">
                {item.connected
                  ? t("enginesTab.providerConnected")
                  : t("enginesTab.providerMissing")}
              </p>
              <p className="m-0 text-sm">{t("enginesTab.dataforseoFact")}</p>
            </div>
          ))}
          <Button
            className="w-fit self-start"
            component={Link}
            href={providersHref}
            size="sm"
            variant="secondary"
          >
            {t("enginesTab.providersOpen")}
          </Button>
        </Card>
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 font-sans text-ui-section">{t("enginesTab.routingTitle")}</h2>
          <p className="m-0 text-sm">{t("enginesTab.routingBody")}</p>
        </Card>
      </div>
    </div>
  );
}
