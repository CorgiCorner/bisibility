import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { input, result } from "@/lib/model-playground/contract-fixtures.test-support";
import { buildModelPlaygroundReport } from "@/lib/model-playground/report-body";
import ai from "@/messages/core/en/project-ai-research.json";
import shared from "@/messages/core/en/shared.json";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";
import { AgentReportDetail } from "./AgentReportDetail";

const base = {
  projectRef: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
  provenanceLabel: "Provenance",
  savedDetailsLabel: "Details",
};
it("opens the full retained native answer and leaves legacy reports readable", async () => {
  const answer = `${"retained answer ".repeat(500)}LAST WORD`;
  const body = buildModelPlaygroundReport(
    crypto.randomUUID(),
    input(),
    [{ ...result(), answer }],
    [],
  );
  const mounted = renderWithFeatureMessages(
    <AgentReportDetail
      {...base}
      report={{
        id: "agr_aaaaaaaaaaaaaaaaaaaaaaaa",
        kind: "prompt_explorer",
        title: "Native",
        createdAt: "2026-11-11T12:00:00Z",
        provenance: { source: "model_playground", runId: body.runId },
        modelPlaygroundRunId: body.runId,
        body,
      }}
    />,
    { messages: { ...ai, ...shared } },
  );
  expect(screen.getByText(/Combined cost unknown/)).toBeVisible();
  expect(screen.getByText(/^Brands as tracked on /)).toBeVisible();
  expect(screen.getAllByText("API response").length).toBeGreaterThan(0);
  await userEvent.click(screen.getByRole("button", { name: "Full retained answer" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("LAST WORD");
  mounted.unmount();
  renderWithFeatureMessages(
    <AgentReportDetail
      {...base}
      report={{
        id: "agr_aaaaaaaaaaaaaaaaaaaaaaaa",
        kind: "prompt_explorer",
        title: "Legacy",
        createdAt: "2026-11-11T12:00:00Z",
        provenance: {},
        body: { input: { prompt: "Legacy retained prompt" }, result: { rows: [] } },
      }}
    />,
    { messages: { ...ai, ...shared } },
  );
  expect(screen.getByText("Legacy retained prompt")).toBeVisible();
});

it.each(["no provenance", "no link", "foreign link", "forged run"])(
  "renders a forged native body as legacy: %s",
  (kind) => {
    const body = buildModelPlaygroundReport(crypto.randomUUID(), input(), [result()], []);
    renderWithFeatureMessages(
      <AgentReportDetail
        {...base}
        report={{
          id: "agr_aaaaaaaaaaaaaaaaaaaaaaaa",
          kind: "prompt_explorer",
          title: "Forged",
          createdAt: "2026-11-11T12:00:00Z",
          body,
          provenance:
            kind === "no provenance"
              ? {}
              : {
                  source: "model_playground",
                  runId: kind === "forged run" ? crypto.randomUUID() : body.runId,
                },
          modelPlaygroundRunId:
            kind === "no link"
              ? undefined
              : kind === "foreign link"
                ? crypto.randomUUID()
                : body.runId,
        }}
      />,
      { messages: { ...ai, ...shared } },
    );
    expect(document.querySelector("[data-model-report]")).toBeNull();
    expect(screen.getByText("Forged")).toBeVisible();
  },
);
