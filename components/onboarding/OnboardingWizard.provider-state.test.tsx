import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { project, renderWizard } from "./OnboardingWizard.test-utils";

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

describe("OnboardingWizard provider state", () => {
  it("does not carry dirty credentials into another saved provider after returning", async () => {
    renderWizard({
      initialFlowState: { projectId: "prj_1", providerId: "dataforseo" },
      initialProject: project,
      initialSerpConnections: { dataforseo: {}, serpapi: {} },
      initialStep: 3,
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
    expect(await screen.findByRole("heading", { name: "Tracking defaults" })).toBeInTheDocument();

    const rail = screen.getByLabelText("Onboarding steps");
    fireEvent.click(within(rail).getByRole("button", { name: "Connect data, completed" }));

    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("");
    expect(screen.queryByDisplayValue("dataforseo-secret")).not.toBeInTheDocument();
  });
});
