import { integrationCategories } from "@/components/integrations/integrations-fixtures";
import { ProviderCardHeader } from "@/components/integrations/ProviderCardHeader";
import { renderWithIntegrationMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import type { ConnectionRecoveryView } from "@/lib/integrations/provider-recovery/types";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProviderRecovery } from "./ProviderRecovery";

vi.mock("@/lib/actions/provider-recovery", () => ({
  checkProviderRecoveryAccount: vi.fn(),
  loadProviderAffectedChecks: vi.fn(),
}));
const view: ConnectionRecoveryView = {
  state: "billing",
  reason: "provider_billing",
  paused: true,
  accountVerified: false,
  checkedAt: null,
  affectedChecks: 0,
  checksNotSent: 3,
  currentIncidentChecksNotSent: 3,
  unconfirmedRequests: 0,
  revision: "incident",
  canCheck: true,
  nextCheckAt: null,
  rangeEnd: "2026-10-29T12:00:00Z",
};
const props = {
  initial: view,
  projectId: "prj_example",
  connectionId: "conn_example",
  providerName: "SerpApi",
  accountUrl: "https://serpapi.com/change-plan",
};

describe("provider account recovery", () => {
  it("never labels a paused connection connected", () => {
    render(
      <ProviderCardHeader
        provider={{ ...integrationCategories[0].providers[0], recovery: view }}
        canManageProviders
      />,
    );
    expect(screen.getByText("Connection paused")).toBeVisible();
    expect(screen.queryByText("Connected")).not.toBeInTheDocument();
  });
  it("shows a scoped cause, count and verified provider link without inventing accounting review", () => {
    render(<ProviderRecovery {...props} canManage />);
    expect(screen.getByText("Check the SerpApi account")).toBeVisible();
    expect(screen.getByRole("link", { name: "Open SerpApi" })).toHaveAttribute(
      "href",
      props.accountUrl,
    );
    expect(screen.getByText("3 checks not sent")).toBeVisible();
    expect(screen.queryByText(/earlier requests need accounting review/i)).not.toBeInTheDocument();
    expect(screen.getByText(/All incidents through/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByText(/New paid attempts on this connection remain paused/)).toBeVisible();
    expect(screen.getByText("3 checks not sent")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show details" }));
    expect(screen.getByText("Check the SerpApi account")).toBeVisible();
  });
  it("gates management and hides unsupported checks", () => {
    const { rerender } = render(<ProviderRecovery {...props} canManage={false} />);
    expect(screen.getByText(/Ask a project owner/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Check" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open SerpApi" })).not.toBeInTheDocument();
    rerender(
      <ProviderRecovery
        key="unsupported"
        {...props}
        initial={{ ...view, canCheck: false }}
        canManage
      />,
    );
    expect(screen.queryByRole("button", { name: "Check" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open SerpApi" })).toBeVisible();
  });
  it("separates credentials, restricted access and accounting reasons", () => {
    const { rerender } = render(
      <ProviderRecovery
        {...props}
        initial={{ ...view, state: "review", reason: "provider_auth" }}
        canManage
      />,
    );
    expect(screen.getByText("Update the SerpApi credentials")).toBeVisible();
    rerender(
      <ProviderRecovery
        key="restricted"
        {...props}
        initial={{
          ...view,
          state: "review",
          reason: "provider_account_restricted",
          scope: { kind: "capability", capability: "rank_check" },
        }}
        canManage
      />,
    );
    expect(screen.getByText("Check SerpApi access")).toBeVisible();
    expect(screen.getByText(/restricted access to rank checks/)).toBeVisible();
    rerender(
      <ProviderRecovery
        key="accounting"
        {...props}
        initial={{
          ...view,
          state: "review",
          reason: "accounting_review",
          unconfirmedRequests: 2,
          accountVerified: true,
        }}
        canManage
      />,
    );
    expect(screen.getByText("Earlier requests need review")).toBeVisible();
    expect(screen.getByText("2 earlier requests need accounting review")).toBeVisible();
  });
});
