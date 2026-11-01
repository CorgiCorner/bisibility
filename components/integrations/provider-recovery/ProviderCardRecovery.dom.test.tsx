import { integrationCategories } from "@/components/integrations/integrations-fixtures";
import { ProviderCard } from "@/components/integrations/ProviderCard";
import { renderWithIntegrationMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/provider-recovery", () => ({
  checkProviderRecoveryAccount: vi.fn(),
  loadProviderAffectedChecks: vi.fn(),
}));
vi.mock("@/components/integrations/ConnectDrawer", () => ({ ConnectDrawer: () => null }));

describe("provider card recovery", () => {
  it("keeps paused status and count when collapsed and omits an empty reader footer", () => {
    const provider = {
      ...integrationCategories[0].providers[0],
      connectionId: "conn_example",
      recovery: {
        state: "billing" as const,
        accountVerified: false,
        checkedAt: null,
        affectedChecks: 0,
        checksNotSent: 3,
        unconfirmedRequests: 0,
        revision: "incident",
        paused: true,
        rangeEnd: "2026-10-29T12:00:00Z",
      },
    };
    const { container } = render(
      <ProviderCard
        provider={provider}
        projectId="prj_1"
        canManageProviders={false}
        canUpdateProject={false}
        timeZone="UTC"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByText("Connection paused")).toBeVisible();
    expect(screen.getByRole("button", { name: "3 checks not sent" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Show details" })).toBeVisible();
    expect(screen.queryByText("Check the DataForSEO account")).not.toBeInTheDocument();
    expect(container.querySelector("[data-provider-footer]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByText("Check the DataForSEO account")).toBeVisible();
  });
});
