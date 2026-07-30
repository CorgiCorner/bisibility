import { appPath } from "@/lib/routing/app-path";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DeployWebhooksSection } from "./DeployWebhooksSection";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const hooks = [
  {
    createdLabel: "created today",
    disabled: false,
    id: "hook_1",
    label: "Production deploy",
    lastUsedLabel: "never used",
  },
];

describe("DeployWebhooksSection", () => {
  it("renders hook status without management controls below admin", () => {
    render(
      <DeployWebhooksSection endpointUrl="https://example.com/api/ingest/deploy" hooks={hooks} />,
    );

    expect(screen.getByText("Production deploy")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Create webhook" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Disable Production deploy webhook" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete Production deploy webhook" }),
    ).not.toBeInTheDocument();
  });

  it("rotates an active hook and reveals the replacement once", async () => {
    const rotateHook = vi.fn().mockResolvedValue({
      id: "hook_1",
      label: "Production deploy",
      maskedValue: "bih_live_new******1234",
      raw: "bih_live_new_token_value_1234",
    });
    render(
      <DeployWebhooksSection
        endpointUrl="https://example.com/api/ingest/deploy"
        hooks={hooks}
        projectId="prj_1"
        rotateHook={rotateHook}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Rotate Production deploy webhook" }));

    expect(await screen.findByText("Rotated deploy webhook")).toBeVisible();
    expect(screen.getByText("bih_live_new_token_value_1234")).toBeVisible();
    expect(rotateHook).toHaveBeenCalledWith({ hookId: "hook_1", projectId: "prj_1" });
  });

  it("sends a test event and links to the created signal inline", async () => {
    const sendTestHook = vi.fn().mockResolvedValue({
      signalHref: "/app/prj_1/timeline?filter=deploys&q=sig_test#signal-sig_test",
      signalId: "sig_test",
    });
    render(
      <DeployWebhooksSection
        endpointUrl="https://example.com/api/ingest/deploy"
        hooks={hooks}
        projectId="prj_1"
        sendTestHook={sendTestHook}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Send Production deploy test event" }));

    expect(await screen.findByText("Test event created.")).toBeVisible();
    expect(screen.getByRole("link", { name: "View signal" })).toHaveAttribute(
      "href",
      `${appPath("prj_1", "timeline")}?filter=deploys&q=sig_test#signal-sig_test`,
    );
    expect(sendTestHook).toHaveBeenCalledWith({ hookId: "hook_1", projectId: "prj_1" });
  });

  it("warns that deleting a hook makes configured sources fail", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <DeployWebhooksSection
        deleteHook={vi.fn()}
        endpointUrl="https://example.com/api/ingest/deploy"
        hooks={hooks}
        projectId="prj_1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete Production deploy webhook" }));

    expect(confirm).toHaveBeenCalledWith(
      "Delete Production deploy? Sources using this token will start failing immediately. This cannot be undone.",
    );
  });
});
