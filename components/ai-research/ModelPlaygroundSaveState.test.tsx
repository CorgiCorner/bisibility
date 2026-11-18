import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { composerFixture } from "@/lib/model-playground/composer-fixtures.test-support";
import { input } from "@/lib/model-playground/contract-fixtures.test-support";
import { createFakeModelPlaygroundLaunchService } from "@/lib/model-playground/launch-service.fake.test-support";
import type { ReportSaveStatus } from "@/lib/model-playground/report-state";
import ai from "@/messages/core/en/project-ai-research.json";
import shared from "@/messages/core/en/shared.json";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const report = vi.hoisted(() => ({
  status: "pending" as ReportSaveStatus,
  save: vi.fn(),
  checkAgain: vi.fn(),
}));
vi.mock("./useModelPlaygroundReport", () => ({
  useModelPlaygroundReport: (_project: string, result: unknown) => ({ ...report, result }),
}));
vi.mock("./ModelPlaygroundHistory", () => ({ ModelPlaygroundHistoryButton: () => null }));

import { ModelPlaygroundResults } from "./ModelPlaygroundResults";
import { composerCopy } from "./model-playground-composer-copy.test-support";
import { NativeModelPlayground } from "./NativeModelPlayground";

it.each<[ReportSaveStatus, string, boolean]>([
  ["pending", "Check again", false],
  ["storage", "Retry saving report", false],
  ["check_failed", "Check again", false],
  ["forbidden", "Saving report is not permitted", true],
  ["too_large", "Report exceeds the storage limit", true],
  ["read_only", "Check again", false],
  ["unavailable", "Report unavailable", true],
  ["unclassified", "Save report", false],
  ["dismissed", "Report dismissed", true],
  ["saving", "Saving report", true],
])("renders typed %s without a misleading retry", (status, label, disabled) => {
  renderWithFeatureMessages(
    <ModelPlaygroundResults
      canTrack={false}
      columns={[]}
      entities={[]}
      funding={null}
      sourceContext={{ competitorDomains: [], excludedNames: [], overrides: [], ownDomain: null }}
      onRemove={vi.fn()}
      projectId="project"
      prompt={input().prompt}
      running={false}
      topics={[]}
      unfinished={false}
      retainedRun={{ runId: crypto.randomUUID(), input: input() }}
      reportSaveStatus={status}
      onSaveReport={vi.fn()}
    />,
    { messages: { ...ai, ...shared } },
  );
  const button = screen.getByRole("button", { name: label });
  expect(button.hasAttribute("disabled")).toBe(disabled);
  expect(button.parentElement).toHaveAttribute(
    "aria-label",
    ai.projectAiResearch.modelPlayground.reportHints[status],
  );
  expect(screen.queryByRole("status")).toBeNull();
});

it.each(["pending", "check_failed", "read_only", "storage", "unclassified"] as const)(
  "routes %s to the correct read or save operation in the native screen",
  async (status) => {
    report.status = status;
    report.save.mockClear();
    report.checkAgain.mockClear();
    const fixture = composerFixture();
    const service = createFakeModelPlaygroundLaunchService(fixture);
    const launch = vi.spyOn(service, "launch");
    renderWithFeatureMessages(
      <NativeModelPlayground
        config={{
          ...fixture,
          service,
          enabled: true,
          canConnect: true,
          copy: composerCopy,
          languages: [],
          markets: [],
          debounceMs: 1,
        }}
        canRun
        canTrack={false}
        projectId="prj_aaaaaaaaaaaaaaaaaaaaaaaa"
        entities={[]}
        topics={[]}
        sourceOverrides={[]}
      />,
      { messages: { ...ai, ...shared } },
    );
    const run = screen.getByRole("button", { name: "Run" });
    await waitFor(() => expect(run).not.toBeDisabled());
    fireEvent.click(run);
    const button = await screen.findByRole("button", {
      name:
        status === "storage"
          ? "Retry saving report"
          : status === "unclassified"
            ? "Save report"
            : "Check again",
    });
    fireEvent.click(button);
    expect(report.checkAgain).toHaveBeenCalledTimes(
      status === "storage" || status === "unclassified" ? 0 : 1,
    );
    expect(report.save).toHaveBeenCalledTimes(
      status === "storage" || status === "unclassified" ? 1 : 0,
    );
    if (status === "unclassified") expect(report.save).toHaveBeenCalledWith(expect.any(String));
    expect(launch).toHaveBeenCalledOnce();
  },
);
