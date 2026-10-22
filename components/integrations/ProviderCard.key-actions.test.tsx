import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { renderWithIntegrationMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { IntegrationProviderData, ProviderActionHandlers } from "@/lib/integrations/types";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { integrationCategories } from "./integrations-fixtures";
import { ProviderCard } from "./ProviderCard";

vi.mock("@/components/integrations/ConnectDrawer", () => ({
  ConnectDrawer: ({ open }: { open: boolean }) => (open ? <div data-testid="key-drawer" /> : null),
}));
vi.mock("@/components/settings/AccountDataSourceSlot", () => ({
  ProviderDataSourceSlot: () => null,
}));
const base = {
  ...integrationCategories[0].providers[0],
  status: "connected" as const,
  connectionId: "conn_a00000000000000000000000",
  connectionUpdatedAt: "2026-10-21T10:00:00.000Z",
};
const card = (provider: IntegrationProviderData = base, canManageProviders = true) => (
  <ProviderCard
    canManageProviders={canManageProviders}
    canUpdateProject
    projectId="prj_1"
    provider={provider}
    timeZone="UTC"
  />
);

describe("source-aware provider key actions", () => {
  it.each([false, true])(
    "omits generic key management and disconnect for credits (retained=%s)",
    (hasStoredCredentials) => {
      render(
        card({
          ...base,
          credentialSource: "hosted",
          hasStoredCredentials,
          secondaryAction: "Test",
        }),
      );
      expect(screen.queryByRole("button", { name: /Manage|Connect|Actions for/ })).toBeNull();
      expect(screen.queryByRole("menuitem", { name: /Test|Disconnect|Remove key/ })).toBeNull();
    },
  );
  it("opens the key drawer for own-key management", () => {
    render(card({ ...base, credentialSource: "own" }));
    fireEvent.click(screen.getByRole("button", { name: "Manage key" }));
    expect(screen.getByTestId("key-drawer")).toBeInTheDocument();
  });
  it.each(["connectionId", "connectionUpdatedAt"] as const)(
    "disables own-key removal without %s",
    (field) => {
      render(card({ ...base, [field]: undefined }));
      fireEvent.click(screen.getByRole("button", { name: "Actions for DataForSEO" }));
      expect(screen.getByRole("menuitem", { name: "Remove key" })).toHaveAttribute(
        "aria-disabled",
        "true",
      );
    },
  );
  it("uses a key-specific confirmation and includes the source binding", async () => {
    const disconnectProvider = vi.fn(async () => undefined);
    const actions = {
      disconnectProvider,
      connectProvider: vi.fn(),
      testProviderConnection: vi.fn(),
      updateProviderSettings: vi.fn(),
      updateProviderCost: vi.fn(),
    } satisfies ProviderActionHandlers;
    render(
      <ProviderCard
        actions={actions}
        canManageProviders
        canUpdateProject
        projectId="prj_1"
        provider={{ ...base, credentialSource: "own" }}
        timeZone="UTC"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions for DataForSEO" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Remove key" }));
    const dialog = screen.getByRole("dialog", { name: "Remove saved key?" });
    expect(dialog).toHaveTextContent("Choose another source to keep using it.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove key" }));
    expect(disconnectProvider).toHaveBeenCalledWith({
      projectId: "prj_1",
      providerId: "dataforseo",
      expectedConnection: {
        id: base.connectionId,
        updatedAt: base.connectionUpdatedAt,
        credentialSource: "own",
      },
    });
  });
  it("preserves read-only removal protection", () => {
    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        {card({ ...base, credentialSource: "own" })}
      </ProjectWriteModeProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Actions for DataForSEO" }));
    expect(screen.getByRole("menuitem", { name: "Remove key" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });
  it("preserves generic analytics management and disconnection", () => {
    render(card({ ...integrationCategories[1].providers[1], status: "connected" }));
    expect(screen.getByRole("button", { name: "Manage" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Actions for Google Analytics 4" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Disconnect" }));
    expect(screen.getByRole("dialog", { name: "Disconnect provider" })).toBeInTheDocument();
  });
  it("does not offer owner controls to a viewer", () => {
    render(card({ ...base, credentialSource: "own" }, false));
    expect(screen.queryByRole("button", { name: /Manage key|Actions for/ })).toBeNull();
  });
});
