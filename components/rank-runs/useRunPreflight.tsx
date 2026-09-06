"use client";

import { launchRankCheckRunAction } from "@/lib/actions/rank-check-run-launch";
import type { PreviewRankCheckRunActionInput } from "@/lib/actions/rank-check-run-preview-result";
import type { ProblemDetails } from "@/lib/api/responses";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";
import type { RunSelectionSpec } from "@/lib/rank-check/runs/selection";
import { DEFAULT_SERP_DEPTH, type SerpDepth } from "@/lib/serp/markets";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PreflightDialog } from "./PreflightDialog";
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

function plural(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

function providerLabel(id: string) {
  if (id === "dataforseo") return "DataForSEO";
  if (id === "serpapi") return "SerpApi";
  return id;
}

function providers(providerId?: string | null): readonly PreflightProvider[] {
  if (!providerId) return [];
  return [
    {
      id: providerId,
      label: providerLabel(providerId),
      tooltip: "Configured primary provider.",
    },
  ];
}

function scope(rows: readonly KeywordRow[]): PreflightScope {
  const markets = [...new Set(rows.map((row) => row.location.displayName))];
  const devices = [...new Set(rows.map((row) => row.device))];
  const marketLabel =
    markets.length === 1 ? (markets[0] ?? "this market") : `${markets.length} markets`;
  const deviceLabel = devices.length === 1 ? (devices[0] ?? "device") : `${devices.length} devices`;
  const one = rows.length === 1;
  return {
    description: `Checks ${plural(rows.length, "keyword")} across ${marketLabel} before anything is sent to the provider.`,
    equation: `${plural(rows.length, "keyword")} · ${marketLabel} · ${deviceLabel} = ${plural(rows.length, "target")}`,
    startLabel: "Start run",
    subtitle: `Review the ${marketLabel} scope before starting.`,
    title: one
      ? `Check ${rows[0]?.keyword ?? "keyword"} in ${marketLabel}`
      : `Check ${plural(rows.length, "selected keyword")} in ${marketLabel}`,
  };
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

function problemMessage(payload: unknown) {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const detail = (payload as ProblemDetails).detail;
    if (typeof detail === "string" && detail) return detail;
  }
  return "Could not load the run estimate. Try again.";
}

export async function previewRankCheckRunFromApp(
  input: PreviewRankCheckRunActionInput,
): Promise<RankCheckRunPreview> {
  const response = await fetch("/api/rank-check-runs/preview", {
    body: JSON.stringify(input),
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(problemMessage(payload));
  if (!payload || typeof payload !== "object" || !("data" in payload)) {
    throw new Error("Could not load the run estimate. Try again.");
  }
  return (payload as PreviewEnvelope).data;
}

export function useRunPreflight({ projectId, providerId }: Readonly<UseRunPreflightOptions>) {
  const router = useRouter();
  const [active, setActive] = useState<ActivePreflight | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

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
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not load the run estimate.",
      );
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
          budgetHref={`/app/${projectId}/settings/usage?budget=edit`}
          duplicateRunHref={`/app/${projectId}/rank-tracker?tab=runs`}
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
          providers={providers(providerId)}
          scope={scope(active.rows)}
          spec={active.spec}
        />
      ) : null}
    </>
  );

  return { dialog, opening, request };
}
