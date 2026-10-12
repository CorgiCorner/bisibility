import { renderWithIntegrationMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { useProviderAction } from "@usagekit/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderUiFeedback } from "./ProviderUiFeedback";
import { ProviderUiProvider, useProviderUiStatus } from "./ProviderUiProvider";
import { providerUiBinding } from "./provider-ui-fixtures";

const host = vi.hoisted(() => ({ binding: vi.fn(), session: vi.fn(), execute: vi.fn() }));
vi.mock("@/lib/auth/client", () => ({ authClient: { useSession: host.session } }));
vi.mock("@/lib/actions/provider-ui", () => ({
  getProviderUiBindingAction: host.binding,
  readProviderUiAction: vi.fn(),
  executeProviderUiAction: host.execute,
  reconcileProviderUiAction: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  host.session.mockReturnValue({
    data: { user: { id: "user_a" }, session: { id: "session_a" } },
    isPending: false,
  });
  host.binding.mockResolvedValue(providerUiBinding());
});
function Probe() {
  const action = useProviderAction();
  return (
    <button type="button" disabled={!action.canWrite}>
      Provider write
    </button>
  );
}

function FeedbackProbe() {
  const action = useProviderAction();
  return (
    <>
      <Probe />
      <ProviderUiFeedback action={action} />
    </>
  );
}

function StatefulSettingsProbe() {
  const action = useProviderAction();
  const status = useProviderUiStatus();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("0.012345");
  return (
    <>
      <button type="button" disabled={!action.canWrite} onClick={() => setOpen(true)}>
        Manage provider
      </button>
      <button type="button" onClick={status.refresh}>
        Refresh provider access
      </button>
      {open ? (
        <section role="dialog" aria-label="Provider settings">
          <input
            aria-label="Rate in USD"
            disabled={!action.canWrite}
            onChange={(event) => setDraft(event.target.value)}
            value={draft}
          />
          <button
            type="button"
            disabled={!action.canWrite}
            onClick={() =>
              void action.run({
                kind: "rates",
                commandId: "70d864c1-2672-4c4f-b001-79ddc0b4b240",
                connectionId: "conn_test_a",
                expectedRevision: "0".repeat(64),
                rates: [{ rateId: "rank_check", price: "2.3456" }],
              })
            }
          >
            Save rate
          </button>
          <ProviderUiFeedback action={action} />
        </section>
      ) : null}
    </>
  );
}

describe("verified project provider context", () => {
  it("keeps open provider settings and their draft fenced after background binding failure", async () => {
    render(
      <ProviderUiProvider projectId="prj_background_binding">
        <StatefulSettingsProbe />
      </ProviderUiProvider>,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Manage provider" })).not.toBeDisabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage provider" }));
    fireEvent.change(screen.getByLabelText("Rate in USD"), { target: { value: "0.023456" } });
    expect(screen.getByRole("button", { name: "Save rate" })).not.toBeDisabled();

    host.binding.mockRejectedValueOnce(new Error("private background database diagnostic"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh provider access" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Provider settings could not be confirmed.",
    );
    expect(screen.getByRole("dialog", { name: "Provider settings" })).toBeInTheDocument();
    expect(screen.getByLabelText("Rate in USD")).toHaveValue("0.023456");
    expect(screen.getByLabelText("Rate in USD")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save rate" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save rate" }));
    expect(host.execute).not.toHaveBeenCalled();
    expect(screen.queryByText("private background database diagnostic")).toBeNull();
    expect(
      screen.queryByText("You do not have permission to change provider settings."),
    ).toBeNull();
    expect(host.binding).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Reload settings" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save rate" })).not.toBeDisabled(),
    );
    expect(screen.getByRole("dialog", { name: "Provider settings" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(host.binding).toHaveBeenCalledTimes(3);
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("shows sanitized unavailable feedback and fences writes until binding recovery", async () => {
    host.binding.mockRejectedValueOnce(new Error("private synthetic database diagnostic"));
    render(
      <ProviderUiProvider projectId="prj_unavailable">
        <FeedbackProbe />
      </ProviderUiProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Provider settings could not be confirmed.",
    );
    expect(screen.getByRole("button", { name: "Provider write" })).toBeDisabled();
    expect(screen.queryByText("private synthetic database diagnostic")).toBeNull();
    expect(
      screen.queryByText("You do not have permission to change provider settings."),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reload settings" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Provider write" })).not.toBeDisabled(),
    );
    expect(host.binding).toHaveBeenCalledTimes(2);
  });

  it("keeps confirmed missing access forbidden and write-fenced", async () => {
    host.binding.mockResolvedValue(null);
    render(
      <ProviderUiProvider projectId="prj_forbidden">
        <FeedbackProbe />
      </ProviderUiProvider>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You do not have permission to change provider settings.",
    );
    expect(screen.getByRole("button", { name: "Provider write" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Reload settings" })).toBeInTheDocument();
    expect(screen.queryByText("Provider settings could not be confirmed.")).toBeNull();
  });

  it("shares one verification and stable port across inherited leaves", async () => {
    render(
      <ProviderUiProvider projectId="prj_1">
        <ProviderUiProvider projectId="prj_1">
          <Probe />
        </ProviderUiProvider>
        <Probe />
      </ProviderUiProvider>,
    );
    await waitFor(() => expect(screen.getAllByRole("button")).toHaveLength(2));
    await waitFor(() => expect(screen.getAllByRole("button")[0]).not.toBeDisabled());
    expect(host.binding).toHaveBeenCalledTimes(1);
  });
  it("refuses late grants after the authenticated principal changes", async () => {
    let complete: (value: ReturnType<typeof providerUiBinding>) => void = () => {};
    host.binding
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            complete = resolve;
          }),
      )
      .mockResolvedValue({ ...providerUiBinding(), principalKey: "user_b", canManage: false });
    const view = render(
      <ProviderUiProvider projectId="prj_1">
        <Probe />
      </ProviderUiProvider>,
    );
    await waitFor(() => expect(host.binding).toHaveBeenCalledTimes(1));
    host.session.mockReturnValue({
      data: { user: { id: "user_b" }, session: { id: "session_b" } },
      isPending: false,
    });
    view.rerender(
      <ProviderUiProvider projectId="prj_1">
        <Probe />
      </ProviderUiProvider>,
    );
    await waitFor(() => expect(host.binding).toHaveBeenCalledTimes(2));
    complete(providerUiBinding());
    await waitFor(() => expect(screen.getByRole("button")).toBeDisabled());
  });
  it("hides the old write authority while a session or project is unresolved", async () => {
    const view = render(
      <ProviderUiProvider projectId="prj_1">
        <Probe />
      </ProviderUiProvider>,
    );
    await waitFor(() => expect(screen.getByRole("button")).not.toBeDisabled());
    host.session.mockReturnValue({ data: null, isPending: true });
    view.rerender(
      <ProviderUiProvider projectId="prj_2">
        <Probe />
      </ProviderUiProvider>,
    );
    expect(screen.getByRole("button")).toBeDisabled();
    expect(host.binding).toHaveBeenCalledTimes(1);
  });
});
