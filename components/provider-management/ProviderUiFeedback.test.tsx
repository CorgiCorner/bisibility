import { ProviderUiFeedback } from "@/components/provider-management/ProviderUiFeedback";
import { providerUiBinding } from "@/components/provider-management/provider-ui-fixtures";
import { renderWithIntegrationMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ProviderManagementProvider, useProviderAction } from "@usagekit/react";
import type { ProviderBinding, ProviderManagementPort } from "@usagekit/views";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/provider-management/ProviderUiProvider", () => ({
  useProviderUiStatus: () => ({ state: "ready", refresh() {} }),
}));

function Probe() {
  const action = useProviderAction();
  return (
    <>
      <button
        type="button"
        disabled={!action.canWrite || action.ambiguous || action.pending}
        onClick={() =>
          void action.run({
            kind: "rates",
            commandId: "save-original-1",
            connectionId: "connection-1",
            expectedRevision: "revision-1",
            rates: [{ rateId: "keyword_research", price: "0.0001" }],
          })
        }
      >
        Save rate
      </button>
      <ProviderUiFeedback action={action} />
    </>
  );
}

describe("provider save feedback", () => {
  it("checks the original unknown command after write access is revoked without another write", async () => {
    const binding = providerUiBinding();
    const execute = vi.fn<ProviderManagementPort["execute"]>(async (_binding, command) => ({
      outcome: "unavailable",
      commandId: command.commandId,
      message: "Untrusted host diagnostic",
      ambiguous: true,
    }));
    const reconcile = vi.fn<NonNullable<ProviderManagementPort["reconcile"]>>(
      async (_binding, command) => ({
        outcome: "success",
        commandId: command.commandId,
        revision: "revision-2",
      }),
    );
    const port: ProviderManagementPort = {
      read: async () => ({ outcome: "forbidden" }),
      execute,
      reconcile,
    };
    const tree = (current: ProviderBinding) => (
      <ProviderManagementProvider binding={current} port={port}>
        <Probe />
      </ProviderManagementProvider>
    );
    const view = render(tree(binding));
    fireEvent.click(screen.getByRole("button", { name: "Save rate" }));
    await screen.findByText(/The save could not be confirmed/);
    const original = execute.mock.calls[0][1];
    const readOnly = { ...binding, canManage: false, authRevision: "member:active" };
    view.rerender(tree(readOnly));
    expect(screen.getByRole("button", { name: "Save rate" })).toBeDisabled();
    const check = screen.getByRole("button", { name: "Check save status" });
    expect(check).not.toBeDisabled();
    fireEvent.click(check);
    await waitFor(() => expect(reconcile).toHaveBeenCalledWith(readOnly, original));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Untrusted host diagnostic")).toBeNull();
  });
});
