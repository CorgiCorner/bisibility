import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HandoffPanel } from "./MigrateToCloudHandoff";

const mocks = vi.hoisted(() => ({ create: vi.fn(), writeText: vi.fn() }));
vi.mock("@/lib/actions/cloud", () => ({ createCloudMigrationHandoff: mocks.create }));

const publicProjectId = "prj_abcdefghijklmnopqrstuvwx" as const;

const handoff = {
  apiImportUrl: "https://cloud.example/api/v1/cloud/import",
  apiRequest: "POST https://cloud.example/api/v1/cloud/import",
  cloudImportUrl: "https://cloud.example/app",
  cloudOnboardingUrl: "https://cloud.example/cloud/onboarding",
  cloudOrigin: "https://cloud.example",
  cloudWorkspaceUrl: "https://cloud.example/app",
  sourceProjectId: publicProjectId,
};

describe("migration handoff panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue(handoff);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });
  });

  it("generates and copies a self-host handoff with optional inputs", async () => {
    const onHandoff = vi.fn();
    render(
      <HandoffPanel
        direction="to-self-host"
        handoff={null}
        onHandoff={onHandoff}
        projectId={publicProjectId}
        targetOrigin="https://rank.example.com"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await waitFor(() => expect(onHandoff).toHaveBeenCalledWith(handoff));
    expect(mocks.create).toHaveBeenCalledWith({
      projectId: publicProjectId,
      targetOrigin: "https://rank.example.com",
    });
    expect(mocks.writeText).toHaveBeenCalledWith(handoff.cloudImportUrl);
    expect(screen.getByText("self-host import link generated and copied.")).toBeInTheDocument();
  });

  it("shows generation errors and refreshes an existing cloud handoff", async () => {
    mocks.create.mockRejectedValueOnce(new Error("Handoff unavailable"));
    const { rerender } = render(
      <HandoffPanel direction="to-cloud" handoff={null} onHandoff={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByText("Handoff unavailable")).toBeInTheDocument();
    rerender(<HandoffPanel direction="to-cloud" handoff={handoff} onHandoff={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Refresh" })).toBeInTheDocument();
  });
});
