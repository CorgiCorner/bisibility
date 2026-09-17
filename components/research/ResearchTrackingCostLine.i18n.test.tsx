import {
  renderWithFeatureMessages,
  researchFeatureTestMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ResearchEstimateView } from "./ResearchSearchCard";
import { ResearchTrackingCostLine } from "./ResearchTrackingCostLine";
import { useResearchWorkspaceCopy } from "./useResearchWorkspaceCopy";

const polishMessages = structuredClone(researchFeatureTestMessages);
polishMessages.projectResearch.detail.frequencyDaily = "codziennie";
polishMessages.projectResearch.detail.trackingCostEstimated =
  "Koszt śledzenia: <value>~{cost}</value>/miesiąc przy sprawdzaniu {frequency}.";
polishMessages.projectResearch.state.retryCost = "Ponów ~{cost}";

function RetryLabel({ estimate }: Readonly<{ estimate: ResearchEstimateView }>) {
  const copy = useResearchWorkspaceCopy("Europe/Warsaw");
  return <output>{copy.retryLabel(estimate)}</output>;
}

describe("research money presentation", () => {
  it("uses the viewer locale for signed and sub-cent tracking costs", () => {
    const { rerender } = renderWithFeatureMessages(
      <ResearchTrackingCostLine
        fact={{ costCents: -50, frequency: "daily", kind: "estimated", projectDefault: false }}
      />,
      { locale: "pl", messages: polishMessages },
    );

    expect(screen.getByText("~-0,50 USD")).toBeInTheDocument();

    rerender(
      <ResearchTrackingCostLine
        fact={{ costCents: 0.5, frequency: "daily", kind: "estimated", projectDefault: false }}
      />,
    );

    expect(screen.getByText("~< 0,01 USD")).toBeInTheDocument();
    expect(screen.getByText(/Koszt śledzenia/)).toBeInTheDocument();
  });

  it("uses the viewer locale for a sub-cent retry estimate", () => {
    renderWithFeatureMessages(
      <RetryLabel estimate={{ cached: false, costCents: 0.5, loading: false }} />,
      {
        locale: "pl",
        messages: polishMessages,
      },
    );

    expect(screen.getByText("Ponów ~< 0,01 USD")).toBeInTheDocument();
  });
});
