"use client";

import { launchRankCheckRunAction } from "@/lib/actions/rank-check-run-launch";
import type { PreviewRankCheckRunActionInput } from "@/lib/actions/rank-check-run-preview-result";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";
import type { RunSelectionSpec } from "@/lib/rank-check/runs/selection";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { DEFAULT_SERP_DEPTH, type SerpDepth } from "@/lib/serp/constants";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PreflightDialog } from "./PreflightDialog";
import type { CancelOverlappingRunAction } from "./PreflightOverlapNotice";
import type { PreflightProvider, PreflightScope } from "./preflight-presentation";

type PreviewEnvelope = { data: RankCheckRunPreview };

type PreflightRequest = {
  depth: SerpDepth;
  rows: readonly KeywordRow[];
  spec: RunSelectionSpec;
};

type ActivePreflight = PreflightRequest & { preview: RankCheckRunPreview };

type UseRunPreflightOptions = {
  projectId: string;
  providerId?: string | null;
};

function preflightProjectId(projectId: string): PreviewRankCheckRunActionInput["projectId"] {
  return projectId as PreviewRankCheckRunActionInput["projectId"];
}

function providerLabel(id: string) {
  if (id === "dataforseo") return "DataForSEO";
  if (id === "serpapi") return "SerpApi";
  return id;
}

function providers(
  providerId: string | null | undefined,
  t: ReturnType<typeof useTranslations<"shared.rankPreflight">>,
): readonly PreflightProvider[] {
  if (!providerId) return [];
  return [
    {
      id: providerId,
      label: providerLabel(providerId),
      tooltip: t("configuredProvider", { provider: providerLabel(providerId) }),
    },
  ];
}

export function manualPreflightDepth(
  rows: readonly KeywordRow[],
  override: SerpDepth | undefined,
  projectDepth: SerpDepth | undefined,
) {
  const depths = new Set(rows.map((row) => row.schedule.serp_depth ?? row.projectSerpDepth));
  return (
    override ??
    (depths.size === 1 ? depths.values().next().value : projectDepth) ??
    DEFAULT_SERP_DEPTH
  );
}

export async function previewRankCheckRunFromApp(
  input: PreviewRankCheckRunActionInput,
): Promise<RankCheckRunPreview> {
  const response = await fetch("/api/rank-check-runs/preview", {
    // This dialog only starts manual runs, so it asks for the manual overlap rule.
    body: JSON.stringify({ ...input, trigger: "manual" }),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error("rank_run_preview_failed");
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new Error("rank_run_preview_failed");
  }
  return (payload as PreviewEnvelope).data;
}

/** Planned occurrences are skipped once; queued and blocked runs use the run cancel command. */
export const cancelOverlappingRunFromApp: CancelOverlappingRunAction = async (input) => {
  const action = input.status === "planned" ? "skip" : "cancel";
  const response = await fetch(`/api/rank-check-runs/${input.runId}/${action}`, {
    body: JSON.stringify({ projectId: input.projectId }),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  if (!response.ok) throw new Error("rank_run_cancel_failed");
};

export function useRunPreflight({ projectId, providerId }: Readonly<UseRunPreflightOptions>) {
  const t = useTranslations("shared.rankPreflight");
  const router = useRouter();
  const [active, setActive] = useState<ActivePreflight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  function preflightScope(rows: readonly KeywordRow[]): PreflightScope {
    const markets = [...new Set(rows.map((row) => row.location.displayName))];
    const devices = [...new Set(rows.map((row) => row.device))];
    const market =
      markets.length === 1 ? (markets[0] ?? "-") : t("markets", { count: markets.length });
    const device =
      devices.length === 1 ? (devices[0] ?? "-") : t("devices", { count: devices.length });
    return {
      description: t("scopeDescription"),
      equation: t("scopeEquation", {
        devices: device,
        market,
        targets: rows.length,
        keywords: rows.length,
      }),
      startLabel: t("startRun"),
      subtitle: t("scopeSubtitle"),
      title:
        rows.length === 1
          ? t("scopeOne", { keyword: rows[0]?.keyword ?? "-", market })
          : t("scopeMany", { count: rows.length, market }),
    };
  }

  async function request(request: PreflightRequest) {
    if (request.rows.length === 0) return;
    setError(null);
    setOpening(true);
    try {
      const preview = await previewRankCheckRunFromApp({
        depth: request.depth,
        projectId: preflightProjectId(projectId),
        providerId: providerId ?? undefined,
        spec: request.spec,
      });
      setActive({ ...request, preview });
    } catch {
      setError(t("couldNotLoad"));
    } finally {
      setOpening(false);
    }
  }

  const dialog = (
    <>
      {error ? (
        <p className="m-0 text-[12px] text-red-text" role="alert">
          {error}
        </p>
      ) : null}
      {active ? (
        <PreflightDialog
          budgetHref={`/app/${projectId}/integrations?tab=usage&budget=edit`}
          cancelRunAction={cancelOverlappingRunFromApp}
          duplicateRunHref={projectRunsPath(projectId)}
          initialDepth={active.depth}
          initialPreview={active.preview}
          initialProviderId={providerId ?? undefined}
          integrationsHref={`/app/${projectId}/integrations`}
          launchAction={launchRankCheckRunAction}
          onClose={() => setActive(null)}
          onStarted={() => router.refresh()}
          open
          projectId={preflightProjectId(projectId)}
          previewAction={previewRankCheckRunFromApp}
          providers={providers(providerId, t)}
          scope={preflightScope(active.rows)}
          spec={active.spec}
        />
      ) : null}
    </>
  );

  return { dialog, opening, request };
}
