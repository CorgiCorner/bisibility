import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CloudImportWorkspaceButton } from "./CloudImportWorkspaceButton";

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

    const button = screen.getByRole("button", { name: "Import self-hosted project" });
    expect(button.closest("form")).not.toHaveClass("rounded-xl", "border", "p-4");
    expect(button).toHaveStyle({ paddingLeft: "8px", paddingRight: "8px" });
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
});
