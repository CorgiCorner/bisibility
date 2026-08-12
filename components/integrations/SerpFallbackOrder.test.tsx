import type { IntegrationProviderData, ProviderActionHandlers } from "@/lib/integrations/types";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { integrationCategories } from "./integrations-fixtures";
import { SerpFallbackOrder } from "./SerpFallbackOrder";

const actions = {
  connectProvider: vi.fn(async () => undefined),
  disconnectProvider: vi.fn(async () => undefined),
  testProviderConnection: vi.fn(async () => ({ message: "ok", ok: true })),
  updateProviderCost: vi.fn(async () => undefined),
  updateProviderSettings: vi.fn(async () => undefined),
} satisfies ProviderActionHandlers;

function connectedProviders(): IntegrationProviderData[] {
  const [dataForSeo, serpApi] = integrationCategories[0].providers;
  return [
    { ...dataForSeo, enabled: true, primary: true, priority: 0, status: "connected" },
    { ...serpApi, enabled: true, primary: false, priority: 1, status: "connected" },
  ];
}

describe("SerpFallbackOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows active, paused, and disconnected providers in one explicit order", () => {
    const [dataForSeo, serpApi] = connectedProviders();
    render(
      <SerpFallbackOrder
        actions={actions}
        canManageProviders
        projectId="prj_1"
        providers={[
          dataForSeo,
          { ...serpApi, enabled: false },
          { ...serpApi, id: "new", status: "ready" },
        ]}
      />,
    );

    expect(screen.getByText("First provider")).toBeInTheDocument();
    expect(screen.getByText("Paused · not used for rank checks")).toBeInTheDocument();
    expect(screen.getByText("Not connected")).toBeInTheDocument();
  });

  it("persists the visible top-to-bottom order", async () => {
    render(
      <SerpFallbackOrder
        actions={actions}
        canManageProviders
        projectId="prj_1"
        providers={connectedProviders()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Move SerpApi up" }));

    await waitFor(() => expect(actions.updateProviderSettings).toHaveBeenCalledTimes(2));
    expect(actions.updateProviderSettings).toHaveBeenNthCalledWith(1, {
      enabled: true,
      priority: 0,
      projectId: "prj_1",
      providerId: "serpapi",
    });
    expect(actions.updateProviderSettings).toHaveBeenNthCalledWith(2, {
      enabled: true,
      priority: 1,
      projectId: "prj_1",
      providerId: "dataforseo",
    });
    expect(routerMock.refresh).toHaveBeenCalledOnce();
  });

  it("renumbers active providers before paused providers in every update", async () => {
    const [dataForSeo, serpApi] = connectedProviders();
    render(
      <SerpFallbackOrder
        actions={actions}
        canManageProviders
        projectId="prj_1"
        providers={[dataForSeo, serpApi, { ...serpApi, enabled: false, id: "local-sequence" }]}
      />,
    );

    fireEvent.click(screen.getByRole("switch", { name: "Pause DataForSEO" }));

    await waitFor(() => expect(actions.updateProviderSettings).toHaveBeenCalledTimes(3));
    expect(actions.updateProviderSettings).toHaveBeenNthCalledWith(1, {
      enabled: true,
      priority: 0,
      projectId: "prj_1",
      providerId: "serpapi",
    });
    expect(actions.updateProviderSettings).toHaveBeenNthCalledWith(2, {
      enabled: false,
      priority: 100,
      projectId: "prj_1",
      providerId: "dataforseo",
    });
    expect(actions.updateProviderSettings).toHaveBeenNthCalledWith(3, {
      enabled: false,
      priority: 101,
      projectId: "prj_1",
      providerId: "local-sequence",
    });
  });

  it("renders provider order without management controls below admin", () => {
    render(
      <SerpFallbackOrder
        actions={actions}
        canManageProviders={false}
        projectId="prj_1"
        providers={connectedProviders()}
      />,
    );

    expect(screen.getByText("First provider")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Move .* (up|down)/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByText("Connect below")).not.toBeInTheDocument();
  });
});
