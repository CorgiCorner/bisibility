import { featureMessagesElement } from "@/i18n/test-support/render-with-feature-messages";
import { localPointEvidence } from "@/lib/local-monitor-results/evidence";
import { localResultFixture, resultObservation } from "@/lib/local-monitor-results/fixture";
import type { LocalMonitorRunResult } from "@/lib/local-monitor-results/model";
import { projectLocalRun } from "@/lib/local-monitor-results/projection";
import sharedMessages from "@/messages/core/en/shared.json";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MonitorRunResults } from "./MonitorRunResults";

vi.mock("@/lib/local-monitor-results/session-actions", () => ({
  readLocalRunHistoryAction: vi.fn(),
  exportLocalRunResultAction: vi.fn(),
  readLocalPointListingsAction: vi.fn(),
  readLocalPointHistoryAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
function markup(unavailable = false) {
  const { binding, receipt, now } = localResultFixture(),
    row = binding.rows[0],
    saved = resultObservation(row),
    proof = localPointEvidence(
      row,
      saved.observation,
      saved.decisions,
      binding.definition.identityRevisionId,
      now,
    ),
    projection = projectLocalRun(binding, new Map([[row.item.id, proof]]), receipt, now);
  const report: LocalMonitorRunResult = {
    version: 1,
    projectId: "prj_abcdefghijklmnopqrstuvwx",
    monitorId: "lmn_abcdefghijklmnopqrstuvwx",
    runId: binding.run.publicId,
    asOf: now.toISOString(),
    createdAt: binding.run.createdAt.toISOString(),
    definitionRevisionId: binding.revision.id,
    definitionRevision: 1,
    identityRevisionId: binding.definition.identityRevisionId,
    subject: "Synthetic business",
    protocol: {
      geometry: binding.definition.grid.geometryModel,
      matcher: "business-match-maps-v1",
      normalizerVersions: [row.record.adapterVersion],
      metricDefinition: "sampled-grid-top-n-v1",
    },
    financialBasis: "current_accounting_state",
    receipt,
    ...projection,
  };
  return renderToStaticMarkup(
    featureMessagesElement(
      <QueryClientProvider client={new QueryClient()}>
        <MonitorRunResults
          projectId={report.projectId}
          monitorId={report.monitorId}
          report={unavailable ? null : report}
          unavailable={unavailable}
          initialHistory={{
            version: 1,
            projectId: report.projectId,
            monitorId: report.monitorId,
            asOf: report.asOf,
            items: [
              {
                runId: report.runId,
                createdAt: report.createdAt,
                definitionRevision: 1,
                mode: "manual",
              },
            ],
            nextCursor: null,
          }}
        />
      </QueryClientProvider>,
      { locale: "en", timeZone: "UTC", messages: sharedMessages },
    ),
  );
}
describe("actual saved Maps results UI", () => {
  it("renders qualified native rank in semantic grid and table, Local exports and separate run history", () => {
    const html = markup();
    expect(html).toContain("Qualified business rank");
    expect(html).toContain("Sampled point grid");
    expect(html).toContain("Confirmed positive rank");
    expect(html).toContain("Export Local CSV v1");
    expect(html).toContain("Export Local JSON v1");
    expect(html).toContain("Run history");
    expect(html).toContain("100%");
    expect(html).toContain("-21.0000000");
    expect(html).toContain("run=lmr_");
    expect(html).not.toContain("taskIds");
  });
  it("foreign or historical unavailable read shows explicit unavailable without rank or export", () => {
    const html = markup(true);
    expect(html).toContain("This saved run is unavailable");
    expect(html).not.toContain("Export Local CSV v1");
    expect(html).not.toContain("Confirmed positive rank");
  });
});
