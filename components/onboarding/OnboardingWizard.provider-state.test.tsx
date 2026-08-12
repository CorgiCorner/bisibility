import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { project, renderWizard } from "./OnboardingWizard.test-utils";

describe("OnboardingWizard provider state", () => {
  it("keeps the connected provider from flow state when no connection map is supplied", () => {
    renderWizard({
      initialFlowState: { projectId: "prj_1", providerId: "dataforseo" },
      initialKeywordCount: 1,
      initialProject: project,
      initialStep: 4,
      providerConnected: true,
    });

    expect(screen.getByText("DataForSEO")).toBeInTheDocument();
  });

  it("prefers the saved provider over a stale provider in the URL", () => {
    renderWizard({
      initialFlowState: { projectId: "prj_1", providerId: "dataforseo" },
      initialKeywordCount: 1,
      initialProject: project,
      initialSerpConnections: { serpapi: {} },
      initialStep: 4,
      providerConnected: true,
    });

    expect(screen.getByText("SerpApi")).toBeInTheDocument();
    expect(screen.queryByText("DataForSEO")).not.toBeInTheDocument();
  });

  it("does not carry dirty credentials into another saved provider after returning", async () => {
    renderWizard({
      initialFlowState: { projectId: "prj_1", providerId: "dataforseo" },
      initialProject: project,
      initialSerpConnections: { dataforseo: {}, serpapi: {} },
      initialStep: 2,
      providerConnected: true,
    });

    fireEvent.change(screen.getByLabelText("API login"), {
      target: { value: "dataforseo-login" },
    });
    fireEvent.change(screen.getByLabelText("API password"), {
      target: { value: "dataforseo-secret" },
    });
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(
      await screen.findByRole("heading", { name: "Add your first keywords" }),
    ).toBeInTheDocument();

    const rail = screen.getByLabelText("Onboarding steps");
    fireEvent.click(within(rail).getByRole("button", { name: "Connect data, completed" }));

    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("");
    expect(screen.queryByDisplayValue("dataforseo-secret")).not.toBeInTheDocument();
  });
});
