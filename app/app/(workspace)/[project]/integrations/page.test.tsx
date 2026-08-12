import type { ProviderActionHandlers } from "@/lib/integrations/types";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IntegrationsPage from "./page";

const mocks = vi.hoisted(() => ({
  completeGooglePropertySelection: vi.fn(),
  loadStoredGoogleProperties: vi.fn(),
  getIntegrationsView: vi.fn(),
  integrationCategory: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveProjectAccess: vi.fn(),
  saveStoredGoogleProperty: vi.fn(),
}));

vi.mock("@/components/integrations/IntegrationCategory", () => ({
  IntegrationCategory: (props: unknown) => {
    mocks.integrationCategory(props);
    return null;
  },
}));
vi.mock("@/components/shell/PageContent", () => ({
  PageContent: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/ui", () => ({
  Card: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/lib/actions/providers", () => ({
  completeGooglePropertySelection: mocks.completeGooglePropertySelection,
  connectProvider: vi.fn(),
  disconnectProvider: vi.fn(),
  loadStoredGoogleProperties: mocks.loadStoredGoogleProperties,
  saveStoredGoogleProperty: mocks.saveStoredGoogleProperty,
  testConnection: vi.fn(),
  updateProviderCost: vi.fn(),
  updateProviderRate: vi.fn(),
  updateProviderSettings: vi.fn(),
}));
vi.mock("@/lib/actions/traffic-sync", () => ({ syncProjectTraffic: vi.fn() }));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: () => "owner" }));
vi.mock("@/lib/auth/capabilities", () => ({ canProjectAction: () => true }));
vi.mock("@/lib/providers/analytics/google-oauth-pending", () => ({
  getPendingGoogleOAuthSetup: vi.fn(),
}));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));
vi.mock("@/lib/queries/integrations", () => ({
  getIntegrationsView: mocks.getIntegrationsView,
}));
vi.mock("@phosphor-icons/react/dist/ssr", () => ({ KeyIcon: () => null }));

describe("IntegrationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveProjectAccess.mockResolvedValue({
      publicId: "prj_abcdefghijklmnopqrstuvwx",
    });
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "user_1" },
      project: { id: "project_1" },
    });
    mocks.getIntegrationsView.mockResolvedValue({
      categories: [{ id: "analytics", items: [], title: "Analytics" }],
      connectionCount: 0,
    });
  });

  it("wires verified Google property selection into integration drawers", async () => {
    render(
      await IntegrationsPage({
        params: Promise.resolve({ project: "prj_abcdefghijklmnopqrstuvwx" }),
      }),
    );

    const props = mocks.integrationCategory.mock.calls[0]?.[0] as {
      actions: ProviderActionHandlers;
    };
    expect(props.actions.completeGooglePropertySelection).toBe(
      mocks.completeGooglePropertySelection,
    );
    expect(props.actions.loadStoredGoogleProperties).toBe(mocks.loadStoredGoogleProperties);
    expect(props.actions.saveStoredGoogleProperty).toBe(mocks.saveStoredGoogleProperty);
  });
});
