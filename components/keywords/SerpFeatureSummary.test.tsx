import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { serpFeaturePresentation } from "@/lib/checks/serp-feature-presentation";
import { screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { SerpFeatureSummary } from "./SerpFeatureSummary";

vi.mock("./FetchAiOverview", () => ({ FetchAiOverview: () => null }));

const context = {
  projectRef: "prj_fixture",
  target: { kind: "check" as const, checkId: "check_abcdefgh" },
};

it("offers to load a detected overview whose content was not returned", () => {
  render(
    <SerpFeatureSummary
      features={serpFeaturePresentation([], ["ai_overview"])}
      aiFetchContext={context}
    />,
  );
  expect(screen.getByText("Detected, content not loaded")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Load overview" })).toBeInTheDocument();
});

it("keeps the plain details action when the overview content is retained", () => {
  const features = serpFeaturePresentation([], ["ai_overview"]);
  features.aiOverview.paragraphs = ["Retained overview."];
  render(<SerpFeatureSummary features={features} aiFetchContext={context} />);
  expect(screen.queryByRole("button", { name: "Load overview" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /AI overview/i })).toBeInTheDocument();
});
