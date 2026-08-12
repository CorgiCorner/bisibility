import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepConnectGscCard, StepConnectGscSetupNotice } from "./StepConnectGscCard";

describe("StepConnectGscCard", () => {
  it("matches provider-card hierarchy and keeps setup guidance outside the card", () => {
    const { container } = render(
      <>
        <StepConnectGscSetupNotice configured={false} />
        <StepConnectGscCard configured={false} />
      </>,
    );

    expect(screen.getByText("Setup required").closest("span")).toHaveClass("h-5");
    expect(screen.queryByText("Recommended")).not.toBeInTheDocument();
    expect(screen.queryByText("free", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("GOOGLE_CLIENT_SECRET");
    expect(screen.getByRole("alert").querySelector("span.min-w-0")).toHaveClass("break-words");
    expect(container.querySelector('section [role="alert"]')).not.toBeInTheDocument();
    expect(container.querySelector('section svg[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it("starts OAuth without asking the user to type a property id", () => {
    render(<StepConnectGscCard configured projectId="prj_1" />);

    expect(screen.queryByLabelText("Search Console property")).not.toBeInTheDocument();
    const connectButton = screen.getByRole("link", { name: "Connect" });
    expect(connectButton).toHaveAttribute("href", expect.not.stringContaining("property="));
    expect(connectButton).toHaveClass("MuiButton-outlined");
    expect(connectButton).not.toHaveClass("mt-4");
    expect(connectButton.parentElement).toHaveClass("mt-4");
  });

  it("returns the OAuth roundtrip to onboarding step 2 with the wizard context", () => {
    const returnPath = "/onboarding?step=2&projectId=prj_1&loc=US&device=desktop";
    render(<StepConnectGscCard configured projectId="prj_1" returnPath={returnPath} />);

    const href = screen.getByRole("link", { name: "Connect" }).getAttribute("href");
    const install = new URL(href ?? "", "https://example.com");
    expect(install.searchParams.get("returnPath")).toBe(returnPath);
  });

  it("lets a connected project choose another property without reauthorizing", async () => {
    const returnPath = "/onboarding?step=2&projectId=prj_1";
    const loadStoredProperties = vi.fn(async () => ({
      preferredProperty: "sc-domain:example.com",
      properties: [
        {
          kind: "domain" as const,
          label: "example.com (Domain property)",
          permissionLevel: "siteOwner",
          value: "sc-domain:example.com",
        },
      ],
      provider: "gsc" as const,
    }));
    const saveStoredProperty = vi.fn(async (input) => ({
      property: input.property,
      status: "saved" as const,
    }));
    render(
      <StepConnectGscCard
        configured
        connectedPropertyLabel="sc-domain:example.com"
        loadStoredProperties={loadStoredProperties}
        projectId="prj_1"
        returnPath={returnPath}
        saveStoredProperty={saveStoredProperty}
      />,
    );

    expect(screen.queryByText("Connected to example.com")).not.toBeInTheDocument();
    expect(screen.queryByText(/sc-domain:/)).not.toBeInTheDocument();
    const changeButton = screen.getByRole("button", { name: "Change property" });
    expect(changeButton).not.toHaveClass("mt-4");
    expect(changeButton.parentElement).toHaveClass("mt-4");
    fireEvent.click(changeButton);
    expect(
      await screen.findByRole("heading", { name: "Select a Search Console property" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Use another account" })).toHaveAttribute(
      "href",
      expect.stringContaining("returnPath=%2Fonboarding%3Fstep%3D2%26projectId%3Dprj_1"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Use selected property" }));
    await waitFor(() =>
      expect(saveStoredProperty).toHaveBeenCalledWith({
        projectId: "prj_1",
        property: "sc-domain:example.com",
        provider: "gsc",
      }),
    );
  });

  it("keeps full OAuth available when the stored account must be reconnected", async () => {
    render(
      <StepConnectGscCard
        configured
        connectedPropertyLabel="sc-domain:example.com"
        loadStoredProperties={async () => ({
          error: "Reconnect the Google account to load its properties.",
          properties: [],
          provider: "gsc",
          requiresReauth: true,
        })}
        projectId="prj_1"
        returnPath="/onboarding?step=2&projectId=prj_1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Change property" }));

    expect(
      await screen.findByText("Reconnect the Google account to load its properties."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Use another account" })).toHaveAttribute(
      "href",
      expect.stringContaining("/api/integrations/google/install"),
    );
  });

  it("uses a verified property returned by the connected Google account", async () => {
    const completePropertySelection = vi.fn(async (input) => ({ property: input.property }));
    render(
      <StepConnectGscCard
        completePropertySelection={completePropertySelection}
        configured
        googleOAuth={{
          properties: [
            {
              kind: "domain",
              label: "example.com (Domain property)",
              permissionLevel: "siteOwner",
              value: "sc-domain:example.com",
            },
          ],
        }}
        projectId="prj_1"
      />,
    );

    expect(screen.getByRole("heading", { name: "Select a Search Console property" })).toBeVisible();
    expect(screen.queryByText("Select a verified property")).not.toBeInTheDocument();
    expect(screen.getByText("sc-domain:example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close drawer" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Select a Search Console property" }),
      ).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Select property" }));
    fireEvent.click(screen.getByRole("button", { name: "Use selected property" }));
    await waitFor(() =>
      expect(completePropertySelection).toHaveBeenCalledWith({
        projectId: "prj_1",
        property: "sc-domain:example.com",
      }),
    );
  });
});
