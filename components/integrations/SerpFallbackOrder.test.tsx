import type { IntegrationProviderData, ProviderActionHandlers } from "@/lib/integrations/types";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { integrationCategories } from "./integrations-fixtures";
import { SerpFallbackOrder } from "./SerpFallbackOrder";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const actions = {
  connectProvider: vi.fn(async () => undefined),
  disconnectProvider: vi.fn(async () => undefined),
  setPrimaryProvider: vi.fn(async () => undefined),
  testProviderConnection: vi.fn(async () => ({ message: "ok", ok: true })),
  updateProviderCost: vi.fn(async () => undefined),
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

    fireEvent.click(screen.getByRole("button", { name: "Move SerpAPI up" }));

    await waitFor(() => expect(actions.setPrimaryProvider).toHaveBeenCalledTimes(2));
    expect(actions.setPrimaryProvider).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ primary: true, priority: 0, providerId: "serpapi" }),
    );
    expect(actions.setPrimaryProvider).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ primary: false, priority: 1, providerId: "dataforseo" }),
    );
    expect(refresh).toHaveBeenCalledOnce();
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
