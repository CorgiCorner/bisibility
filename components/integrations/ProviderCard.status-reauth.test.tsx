import type { ProviderCardProps } from "@/components/integrations/ProviderCard";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { integrationCategories } from "./integrations-fixtures";
import { ProviderCard as ProductionProviderCard } from "./ProviderCard";

function ProviderCard({
  timeZone = "UTC",
  ...props
}: Omit<ProviderCardProps, "timeZone"> & { timeZone?: string }) {
  return <ProductionProviderCard {...props} timeZone={timeZone} />;
}

vi.mock("@/components/integrations/ConnectDrawer", () => ({
  ConnectDrawer: ({ open }: { open: boolean }) =>
    open ? <div data-testid="connect-drawer">Connect drawer</div> : null,
}));

describe("ProviderCard", () => {
  it("renders broken Google authorization as an actionable reconnect state", () => {
    const provider = {
      ...integrationCategories[1].providers[0],
      enabled: true,
      status: "needs_reauth" as const,
    };

    render(
      <ProviderCard canManageProviders canUpdateProject projectId="prj_1" provider={provider} />,
    );

    expect(screen.getByText("Reconnect required")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Google authorization is no longer valid. Reconnect to resume traffic and index-status syncs.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Reconnect" }));
    expect(screen.getByTestId("connect-drawer")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync now" })).not.toBeInTheDocument();
  });

  it("does not claim GA4 resumes index-status syncs", () => {
    const ga4 = integrationCategories[1].providers.find(({ id }) => id === "ga4");
    if (!ga4) throw new Error("GA4 fixture is missing");
    const provider = {
      ...ga4,
      enabled: true,
      status: "needs_reauth" as const,
    };

    render(
      <ProviderCard canManageProviders canUpdateProject projectId="prj_1" provider={provider} />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Google authorization is no longer valid. Reconnect to resume traffic syncs.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("index-status");
  });

  it("uses a vendor-neutral reauth message for Plausible", () => {
    const plausible = integrationCategories[1].providers.find(({ id }) => id === "plausible");
    if (!plausible) throw new Error("Plausible fixture is missing");
    const provider = {
      ...plausible,
      enabled: true,
      status: "needs_reauth" as const,
    };

    render(
      <ProviderCard canManageProviders canUpdateProject projectId="prj_1" provider={provider} />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Authorization is no longer valid. Reconnect to resume traffic syncs.",
    );
    expect(alert).not.toHaveTextContent("Google");
  });

  it("falls back to a vendor-neutral reauth message for unknown providers", () => {
    const provider = {
      ...integrationCategories[1].providers[0],
      id: "matomo",
      enabled: true,
      status: "needs_reauth" as const,
    };

    render(
      <ProviderCard canManageProviders canUpdateProject projectId="prj_1" provider={provider} />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(
      "Authorization is no longer valid. Reconnect to resume traffic syncs.",
    );
    expect(alert).not.toHaveTextContent("Google");
  });

  it("keeps provider status visible without manage controls below admin", () => {
    const provider = integrationCategories[0].providers[0];

    render(
      <ProviderCard
        canManageProviders={false}
        canUpdateProject={false}
        projectId="prj_1"
        provider={provider}
      />,
    );

    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("Primary")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Test" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("connect-drawer")).not.toBeInTheDocument();
  });

  it("renders ready as Ready not Ready to connect", () => {
    render(
      <ProviderCard
        canManageProviders
        canUpdateProject
        projectId="prj_1"
        provider={{ ...integrationCategories[0].providers[1], status: "ready" as const }}
      />,
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.queryByText("Ready to connect")).not.toBeInTheDocument();
  });

  it("renders planned and optional with shared defaults", () => {
    const base = integrationCategories[0].providers[0];
    const r1 = render(
      <ProviderCard
        canManageProviders
        canUpdateProject
        projectId="prj_1"
        provider={{ ...base, status: "planned" as const }}
      />,
    );
    expect(screen.getByText("Planned")).toBeInTheDocument();
    r1.unmount();
    render(
      <ProviderCard
        canManageProviders
        canUpdateProject
        projectId="prj_1"
        provider={{ ...base, status: "optional" as const }}
      />,
    );
    expect(screen.getByText("Optional")).toBeInTheDocument();
  });

  it("renders Disabled pill when connected provider is not enabled", () => {
    render(
      <ProviderCard
        canManageProviders
        canUpdateProject
        projectId="prj_1"
        provider={{ ...integrationCategories[0].providers[0], enabled: false }}
      />,
    );
    expect(screen.getByText("Disabled")).toBeInTheDocument();
  });

  it("gives status, Primary, and Disabled pills the shared neutral treatment with an aria-hidden dot", () => {
    const provider = {
      ...integrationCategories[0].providers[0],
      enabled: false,
    };

    render(
      <ProviderCard canManageProviders canUpdateProject projectId="prj_1" provider={provider} />,
    );

    const statusPill = screen.getByText("Connected");
    expect(statusPill).toHaveClass("bg-bg-sunken");
    expect(statusPill).toHaveClass("border-border");
    expect(statusPill.querySelector("[aria-hidden]")).toBeInTheDocument();

    const primaryPill = screen.getByText("Primary");
    expect(primaryPill).toHaveClass("bg-bg-sunken");
    expect(primaryPill).toHaveClass("border-border");
    expect(primaryPill.querySelector("[aria-hidden]")).toBeInTheDocument();

    const disabledPill = screen.getByText("Disabled");
    expect(disabledPill).toHaveClass("bg-bg-sunken");
    expect(disabledPill).toHaveClass("border-border");
    expect(disabledPill.querySelector("[aria-hidden]")).toBeInTheDocument();
  });
});
