import { ProviderUiProvider } from "@/components/provider-management/ProviderUiProvider";
import {
  openRateRow as openRow,
  providerUiBinding,
  providerUiConnection,
  providerUiRate,
} from "@/components/provider-management/provider-ui-fixtures";
import { renderWithIntegrationMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import integrationMessages from "@/messages/core/en/project-integrations.json";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { useProviderConnection } from "@usagekit/react";
import type {
  ProviderCommand,
  ProviderConnection,
  ProviderQuery,
  ProviderReadResult,
} from "@usagekit/views";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConnectionRatePanel } from "./ConnectionRatePanel";

const host = vi.hoisted(() => ({
  binding: vi.fn(),
  read: vi.fn(),
  execute: vi.fn(),
  reconcile: vi.fn(),
  session: vi.fn(),
}));
vi.mock("@/lib/actions/provider-ui", () => ({
  getProviderUiBindingAction: host.binding,
  readProviderUiAction: host.read,
  executeProviderUiAction: host.execute,
  reconcileProviderUiAction: host.reconcile,
}));
vi.mock("@/lib/auth/client", () => ({ authClient: { useSession: host.session } }));
let connection = providerUiConnection();

/** Answers the connections list and the details read the rate panel edits from. */
function serve(current: ProviderConnection) {
  host.read.mockImplementation(
    async (_project: string, query: ProviderQuery): Promise<ProviderReadResult> => ({
      outcome: "ok",
      value:
        query.kind === "details"
          ? {
              kind: "details",
              state: "ok",
              problem: null,
              asOf: null,
              revision: current.revision,
              connection: current,
            }
          : {
              kind: "connections",
              state: "ok",
              problem: null,
              asOf: null,
              revision: current.revision,
              connections: [current],
              providers: [],
            },
    }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  connection = providerUiConnection();
  host.session.mockReturnValue({
    data: { user: { id: "user_1" }, session: { id: "session_1" } },
    isPending: false,
  });
  host.binding.mockResolvedValue(providerUiBinding());
  serve(connection);
  host.execute.mockImplementation(async (_project: string, command: ProviderCommand) => ({
    outcome: "success",
    commandId: command.commandId,
    revision: "revision-2",
  }));
});

function RefreshRateEvidence() {
  const result = useProviderConnection({ connectionId: "conn_data" });
  return (
    <button aria-busy={result.refreshing} onClick={result.refresh} type="button">
      Refresh rate evidence
    </button>
  );
}

describe("ConnectionRatePanel", () => {
  it("reads nothing in a connect flow, which has no connection yet", async () => {
    const { container } = render(
      <ConnectionRatePanel connected={false} projectId="prj_1" providerId="dataforseo" />,
    );
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
    expect(host.binding).not.toHaveBeenCalled();
    expect(host.read).not.toHaveBeenCalled();
  });

  it("does not offer rate writes before the host binding is verified", () => {
    host.binding.mockImplementation(() => new Promise(() => {}));
    render(<ConnectionRatePanel connected projectId="prj_1" providerId="dataforseo" />);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("distinguishes an unresolved rate from a genuine list-price zero after an authorized read", async () => {
    connection.rates = [
      ...connection.rates,
      {
        ...providerUiRate("ranked_keywords"),
        label: "Ranked keywords",
        price: { text: "", unit: "cents", certainty: "unknown" },
        provenance: {
          source: "unknown",
          origin: "unknown",
          checkedAt: null,
          sampleSize: null,
          version: null,
        },
      },
    ];
    render(<ConnectionRatePanel connected projectId="prj_1" providerId="dataforseo" />);

    const listed = await screen.findByRole("button", { name: /^Keyword metrics/ });
    expect(listed).toHaveTextContent("$0.00 / call");
    expect(listed).toHaveTextContent("List price");
    const unresolved = screen.getByRole("button", { name: /^Ranked keywords/ });
    expect(unresolved).toHaveTextContent("No rate yet");
    expect(unresolved).not.toHaveTextContent("$");
  });

  it("edits one row and exposes only the real fallback action", async () => {
    connection.rates = connection.rates.map((rate) =>
      rate.id === "keyword_research"
        ? {
            ...rate,
            fallback: {
              price: { text: "0.5", unit: "cents", certainty: "estimated" },
              provenance: {
                source: "list",
                origin: "catalog",
                checkedAt: "2026-07-22T00:00:00.000Z",
                sampleSize: null,
                version: null,
              },
            },
          }
        : rate,
    );
    render(<ConnectionRatePanel connected projectId="prj_1" providerId="dataforseo" />);

    const research = await openRow("Keyword research");
    await waitFor(() => expect(research.row.getByRole("button", { name: "Save" })).toBeEnabled());
    expect(research.row.getByLabelText(/Price Keyword research/)).toHaveValue("0.01");
    expect(research.row.getByText("Without your rate").nextElementSibling).toHaveTextContent(
      "$0.005",
    );
    const metrics = await openRow("Keyword metrics");
    expect(
      metrics.row.queryByRole("button", { name: /Use (measured rate|list price)|Clear/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(research.row.getByRole("button", { name: "Use list price" }));
    await waitFor(() =>
      expect(host.execute).toHaveBeenCalledWith(
        "prj_1",
        expect.objectContaining({
          kind: "rates",
          connectionId: "conn_data",
          expectedRevision: "revision-1",
          rates: [{ rateId: "keyword_research", price: null }],
        }),
      ),
    );
  });

  it("shows hosted customer prices as a credits price list without any editing controls", async () => {
    connection.fundingSource = "platform";
    connection.capabilities = [];
    connection.rates = connection.rates.map((rate) => ({
      ...rate,
      fundingSource: "platform",
      editable: false,
      price: { text: "0.3250", unit: "cents", certainty: "estimated" },
      provenance: { ...rate.provenance, source: "list", origin: "host" },
    }));
    const { container } = render(
      <ConnectionRatePanel connected projectId="prj_1" providerId="dataforseo" readOnlyRates />,
    );
    await screen.findByRole("heading", { name: "Credits price list" });
    expect(screen.getByText("Keyword research").closest("li")).toHaveTextContent("$0.00325");
    expect(screen.queryByText("List price")).not.toBeInTheDocument();
    expect(screen.queryByText("Your rate")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Save|Clear|Use list|Use measured/ }),
    ).not.toBeInTheDocument();
    expect(container.querySelector("form")).toBeNull();
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("hides stale own-key prices while the drawer already identifies a hosted connection", async () => {
    render(
      <ConnectionRatePanel connected projectId="prj_1" providerId="dataforseo" readOnlyRates />,
    );
    await waitFor(() => expect(host.read).toHaveBeenCalled());
    await act(async () => {});
    expect(screen.queryByRole("button", { name: /^Keyword research/ })).not.toBeInTheDocument();
    expect(screen.queryByText("Your rate")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("discards a BYOK draft when a refreshed connection uses hosted funding", async () => {
    render(
      <ProviderUiProvider projectId="prj_1">
        <RefreshRateEvidence />
        <ConnectionRatePanel connected projectId="prj_1" providerId="dataforseo" />
      </ProviderUiProvider>,
    );
    const research = await openRow("Keyword research");
    fireEvent.change(research.row.getByLabelText(/Price Keyword research/), {
      target: { value: "99" },
    });
    const current = structuredClone(connection);
    current.fundingSource = "platform";
    current.capabilities = [];
    current.rates = current.rates.map((rate) => ({
      ...rate,
      fundingSource: "platform",
      editable: false,
      price: { text: "0.3250", unit: "cents", certainty: "estimated" },
      provenance: { ...rate.provenance, source: "list", origin: "host" },
    }));
    serve(current);
    fireEvent.click(screen.getByRole("button", { name: "Refresh rate evidence" }));
    await screen.findByRole("heading", { name: "Credits price list" });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByText("Keyword research").closest("li")).toHaveTextContent("$0.00325");
    expect(host.execute).not.toHaveBeenCalled();
  });

  it("sends fractional native cents exactly through the shared journal", async () => {
    render(<ConnectionRatePanel connected projectId="prj_1" providerId="dataforseo" />);
    const research = await openRow("Keyword research");
    await waitFor(() => expect(research.row.getByRole("button", { name: "Save" })).toBeEnabled());
    fireEvent.change(research.row.getByLabelText(/Price Keyword research/), {
      target: { value: "0.000001" },
    });
    fireEvent.click(research.row.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(host.execute).toHaveBeenCalledWith(
        "prj_1",
        expect.objectContaining({ rates: [{ rateId: "keyword_research", price: "0.0001" }] }),
      ),
    );
    expect(host.execute).toHaveBeenCalledTimes(1);
  });

  it.each(["rate", "editability", "capability"] as const)(
    "fences an open dirty draft when a successful read withdraws its %s",
    async (withdrawn) => {
      render(
        <ProviderUiProvider projectId="prj_1">
          <RefreshRateEvidence />
          <ConnectionRatePanel connected projectId="prj_1" providerId="dataforseo" />
        </ProviderUiProvider>,
      );
      const research = await openRow("Keyword research");
      await waitFor(() => expect(research.row.getByRole("button", { name: "Save" })).toBeEnabled());
      const input = research.row.getByLabelText(/Price Keyword research/);
      fireEvent.change(input, { target: { value: "0.023456" } });

      const current = structuredClone(connection);
      current.revision = "revision-2";
      if (withdrawn === "rate")
        current.rates = current.rates.filter((rate) => rate.id !== "keyword_research");
      else if (withdrawn === "editability")
        current.rates = current.rates.map((rate) =>
          rate.id === "keyword_research" ? { ...rate, editable: false } : rate,
        );
      else
        current.capabilities = current.capabilities.filter((capability) => capability !== "rates");
      serve(current);
      fireEvent.click(screen.getByRole("button", { name: "Refresh rate evidence" }));
      await waitFor(() =>
        expect(research.row.getByRole("button", { name: "Save" })).toBeDisabled(),
      );
      expect(input).toHaveValue("0.023456");
      expect(input).toHaveAttribute("readonly");
      fireEvent.click(research.row.getByRole("button", { name: "Save" }));
      expect(host.execute).not.toHaveBeenCalled();
    },
  );

  it("displays a precise measured median and requires deliberate valid input before saving it", async () => {
    connection.rates = connection.rates.map((rate, index) =>
      index === 0
        ? {
            ...rate,
            price: { text: "0.62505", unit: "cents", certainty: "estimated" },
            provenance: {
              source: "measured",
              origin: "provider",
              checkedAt: "2026-10-07T00:00:00.000Z",
              sampleSize: "6",
              version: null,
            },
          }
        : rate,
    );
    render(<ConnectionRatePanel connected projectId="prj_1" providerId="dataforseo" />);
    const research = await openRow("Keyword research");
    expect(research.summary).toHaveTextContent("$0.0062505");
    expect(research.summary).toHaveTextContent("Measured");
    await waitFor(() => expect(research.row.getByRole("button", { name: "Save" })).toBeEnabled());
    const input = research.row.getByLabelText(/Price Keyword research/);
    expect(input).toHaveValue("0.0062505");
    fireEvent.click(research.row.getByRole("button", { name: "Save" }));
    await research.row.findByText("Enter a price in dollars with up to six decimal places.");
    expect(host.execute).not.toHaveBeenCalled();
    expect(input).toHaveValue("0.0062505");
    fireEvent.change(input, { target: { value: "0.006251" } });
    fireEvent.click(research.row.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(host.execute).toHaveBeenCalledWith(
        "prj_1",
        expect.objectContaining({ rates: [{ rateId: "keyword_research", price: "0.6251" }] }),
      ),
    );
    expect(host.execute).toHaveBeenCalledTimes(1);
  });

  it.each(["forbidden", "unavailable"] as const)(
    "hides an untouched rate input after a %s read and shows recovered evidence",
    async (failure) => {
      render(
        <ProviderUiProvider projectId="prj_1">
          <RefreshRateEvidence />
          <ConnectionRatePanel connected projectId="prj_1" providerId="dataforseo" />
        </ProviderUiProvider>,
      );
      const research = await openRow("Keyword research");
      const input = research.row.getByLabelText(/Price Keyword research/);
      expect(input).toHaveValue("0.01");
      host.read.mockResolvedValue({ outcome: failure, message: "Stored evidence is unavailable." });
      fireEvent.click(screen.getByRole("button", { name: "Refresh rate evidence" }));
      await waitFor(() => expect(input).toHaveValue(""));
      expect(research.row.getByRole("button", { name: "Save" })).toBeDisabled();
      expect(host.execute).not.toHaveBeenCalled();

      const current = structuredClone(connection);
      current.rates[0].price = { text: "2", unit: "cents", certainty: "estimated" };
      serve(current);
      fireEvent.click(screen.getByRole("button", { name: "Refresh rate evidence" }));
      await waitFor(() => expect(input).toHaveValue("0.02"));
      fireEvent.click(research.row.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(host.execute).toHaveBeenCalledWith(
          "prj_1",
          expect.objectContaining({ rates: [{ rateId: "keyword_research", price: "2" }] }),
        ),
      );
    },
  );

  it.each(["invalid", "conflict", "unavailable", "success"] as const)(
    "uses localized %s feedback without showing server fields or messages",
    async (outcome) => {
      host.execute.mockImplementation(async (_project: string, command: ProviderCommand) => ({
        outcome,
        commandId: command.commandId,
        field: "private_field",
        reason: "untrusted_detail",
        message: "untrusted_message",
        revision: "revision-2",
        ambiguous: false,
      }));
      render(<ConnectionRatePanel connected projectId="prj_1" providerId="dataforseo" />);
      const research = await openRow("Keyword research");
      await waitFor(() => expect(research.row.getByRole("button", { name: "Save" })).toBeEnabled());
      fireEvent.click(research.row.getByRole("button", { name: "Save" }));
      const copy = integrationMessages.projectIntegrations;
      await screen.findByText(
        outcome === "success"
          ? copy.rates.applied
          : outcome === "invalid"
            ? copy.rates.invalidPrice
            : copy.providerManagement[outcome === "conflict" ? "conflict" : "unavailable"],
      );
      expect(screen.queryByText(/untrusted_|private_field/)).toBeNull();
      expect(host.execute).toHaveBeenCalledOnce();
    },
  );

  it.each(["forbidden", "unavailable"] as const)(
    "preserves a manually edited rate through a %s read and recovery",
    async (failure) => {
      render(
        <ProviderUiProvider projectId="prj_1">
          <RefreshRateEvidence />
          <ConnectionRatePanel connected projectId="prj_1" providerId="dataforseo" />
        </ProviderUiProvider>,
      );
      const research = await openRow("Keyword research");
      const input = research.row.getByLabelText(/Price Keyword research/);
      fireEvent.change(input, { target: { value: "0.03" } });
      host.read.mockResolvedValue({ outcome: failure });
      fireEvent.click(screen.getByRole("button", { name: "Refresh rate evidence" }));
      await screen.findByText(
        integrationMessages.projectIntegrations.providerManagement[
          failure === "forbidden" ? "forbidden" : "unavailable"
        ],
      );
      expect(input).toBeInTheDocument();
      expect(input).toHaveValue("0.03");
      expect(research.row.getByRole("button", { name: "Save" })).toBeDisabled();
      serve(connection);
      fireEvent.click(screen.getByRole("button", { name: "Refresh rate evidence" }));
      await waitFor(() => expect(research.row.getByRole("button", { name: "Save" })).toBeEnabled());
      expect(input).toHaveValue("0.03");
      fireEvent.click(research.row.getByRole("button", { name: "Save" }));
      await waitFor(() =>
        expect(host.execute).toHaveBeenCalledWith(
          "prj_1",
          expect.objectContaining({ rates: [{ rateId: "keyword_research", price: "3" }] }),
        ),
      );
    },
  );

  it("keeps ambiguous saves fenced and reconciles the original command without retry", async () => {
    host.execute.mockImplementation(async (_project: string, command: ProviderCommand) => ({
      outcome: "unavailable",
      commandId: command.commandId,
      message: "untrusted detail",
      ambiguous: true,
    }));
    render(<ConnectionRatePanel connected projectId="prj_1" providerId="dataforseo" />);
    const research = await openRow("Keyword research");
    await waitFor(() => expect(research.row.getByRole("button", { name: "Save" })).toBeEnabled());
    fireEvent.click(research.row.getByRole("button", { name: "Save" }));
    await screen.findByText(/The save could not be confirmed/);
    expect(research.row.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.queryByText("untrusted detail")).toBeNull();
    const original = host.execute.mock.calls[0][1];
    host.reconcile.mockResolvedValue({
      outcome: "success",
      commandId: original.commandId,
      revision: "revision-2",
    });
    fireEvent.click(screen.getByRole("button", { name: "Check save status" }));
    await waitFor(() => expect(host.reconcile).toHaveBeenCalledWith("prj_1", original));
    expect(host.execute).toHaveBeenCalledTimes(1);
  });
});
