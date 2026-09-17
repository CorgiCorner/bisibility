import { renderWithOnboardingMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudImportWorkspaceButton } from "./CloudImportWorkspaceButton";

const restoreProjectTooltip =
  "Import a project package from another bisibility instance. We'll create one local project and restore its data. Provider credentials and API keys are not included.";

const createCloudImportWorkspace = vi.hoisted(() => vi.fn());

vi.mock("@/lib/actions/cloud", () => ({ createCloudImportWorkspace }));

describe("CloudImportWorkspaceButton", () => {
  beforeEach(() => {
    routerMock.push.mockClear();
    createCloudImportWorkspace.mockReset();
    createCloudImportWorkspace.mockResolvedValue("/cloud/import?ctx=onboard&project=prj_1");
  });

  it("opens the import flow from the compact footer action", async () => {
    let resolveWorkspace!: (destination: string) => void;
    createCloudImportWorkspace.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveWorkspace = resolve;
        }),
    );
    render(<CloudImportWorkspaceButton />);

    const button = screen.getByRole("button", { name: "Restore project" });
    expect(button.closest("form")).toHaveClass("m-0", "inline-flex", "items-end");
    expect(button.closest("form")).not.toHaveClass("rounded-card", "border", "p-4");
    expect(button).toHaveAttribute("data-variant", "secondary");
    const describedBy = button.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? "")).toHaveTextContent(restoreProjectTooltip);
    expect(screen.queryByRole("button", { name: restoreProjectTooltip })).not.toBeInTheDocument();
    fireEvent.click(button);

    expect(await screen.findByRole("button", { name: "Opening import..." })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    resolveWorkspace("/cloud/import?ctx=onboard&project=prj_1");
    await waitFor(() => expect(createCloudImportWorkspace).toHaveBeenCalledOnce());
    expect(routerMock.push).toHaveBeenCalledWith("/cloud/import?ctx=onboard&project=prj_1", {
      scroll: true,
    });
  });

  it("sends the provided browser timezone to the import workspace action", async () => {
    render(<CloudImportWorkspaceButton browserTimezone="Europe/Madrid" />);

    fireEvent.click(screen.getByRole("button", { name: "Restore project" }));

    await waitFor(() => expect(createCloudImportWorkspace).toHaveBeenCalledOnce());
    expect(createCloudImportWorkspace).toHaveBeenCalledWith("Europe/Madrid");
  });
});
