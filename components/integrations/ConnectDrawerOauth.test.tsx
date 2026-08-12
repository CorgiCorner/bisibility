import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectDrawerOauth } from "./ConnectDrawerOauth";
import { integrationCategories } from "./integrations-fixtures";

function readyGsc() {
  const provider = integrationCategories[1].providers[0];
  return {
    ...provider,
    drawer: {
      ...provider.drawer,
      defaults: { ...provider.drawer.defaults, login: "" },
    },
    status: "ready" as const,
  };
}

function readyGa4() {
  const provider = integrationCategories[1].providers[1];
  return {
    ...provider,
    drawer: {
      ...provider.drawer,
      defaults: { ...provider.drawer.defaults, login: "" },
    },
    status: "ready" as const,
  };
}

describe("ConnectDrawerOauth", () => {
  it("connects Google before asking the user to choose a Search Console property", () => {
    render(<ConnectDrawerOauth projectId="prj_1" provider={readyGsc()} scopes={["webmasters"]} />);

    expect(screen.queryByLabelText("Search Console property")).not.toBeInTheDocument();
    const connectLink = screen.getByRole("link", { name: "Connect Google account" });
    expect(connectLink).toHaveAttribute("href", expect.not.stringContaining("property="));
    expect(screen.getByText(/No API key is required/i)).toBeInTheDocument();
  });

  it("uses the public project ref in the OAuth return path", () => {
    render(
      <ConnectDrawerOauth
        projectId="project_internal_1"
        projectRef="prj_public_1"
        provider={readyGsc()}
        scopes={["webmasters"]}
      />,
    );

    expect(screen.getByRole("link", { name: "Connect Google account" })).toHaveAttribute(
      "href",
      expect.stringContaining("returnPath=%2Fapp%2Fprj_public_1%2Fintegrations"),
    );
  });

  it("shows verified properties returned by Google and saves the exact selected id", async () => {
    const completePropertySelection = vi.fn(async (input) => ({ property: input.property }));
    const provider = {
      ...readyGsc(),
      drawer: {
        ...readyGsc().drawer,
        googleOAuth: {
          properties: [
            {
              kind: "domain" as const,
              label: "example.com (Domain property)",
              permissionLevel: "siteOwner",
              value: "sc-domain:example.com",
            },
          ],
        },
      },
    };
    render(
      <ConnectDrawerOauth
        completePropertySelection={completePropertySelection}
        projectId="prj_1"
        provider={provider}
        scopes={["webmasters"]}
      />,
    );

    expect(screen.getByRole("button", { name: "Search Console property" })).toHaveTextContent(
      "example.com",
    );
    expect(screen.getByText("sc-domain:example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use selected property" }));

    await waitFor(() =>
      expect(completePropertySelection).toHaveBeenCalledWith({
        projectId: "prj_1",
        property: "sc-domain:example.com",
      }),
    );
    expect(await screen.findByText("Connected to sc-domain:example.com")).toBeInTheDocument();
  });

  it("reuses the Google OAuth install flow when authorization needs reconnection", () => {
    const provider = {
      ...readyGsc(),
      drawer: {
        ...readyGsc().drawer,
        defaults: { ...readyGsc().drawer.defaults, login: "sc-domain:example.com" },
      },
      status: "needs_reauth" as const,
    };

    render(<ConnectDrawerOauth projectId="prj_1" provider={provider} scopes={["webmasters"]} />);

    expect(screen.getByText("Reconnect your Google account")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reconnect Google account" })).toHaveAttribute(
      "href",
      expect.stringContaining("/api/integrations/google/install"),
    );
  });

  it("changes a connected property with stored credentials before offering account reauth", async () => {
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
    const provider = {
      ...readyGsc(),
      drawer: {
        ...readyGsc().drawer,
        defaults: { ...readyGsc().drawer.defaults, login: "sc-domain:old.example.com" },
      },
      status: "connected" as const,
    };

    render(
      <ConnectDrawerOauth
        loadStoredProperties={loadStoredProperties}
        projectId="prj_1"
        provider={provider}
        saveStoredProperty={saveStoredProperty}
        scopes={["webmasters"]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Change property" }));
    expect(
      await screen.findByRole("button", { name: "Search Console property" }),
    ).toHaveTextContent("example.com");
    fireEvent.click(screen.getByRole("button", { name: "Use selected property" }));

    await waitFor(() =>
      expect(saveStoredProperty).toHaveBeenCalledWith({
        projectId: "prj_1",
        property: "sc-domain:example.com",
        provider: "gsc",
      }),
    );
    expect(screen.getByRole("link", { name: "Reconnect account" })).toHaveAttribute(
      "href",
      expect.stringContaining("/api/integrations/google/install"),
    );
  });

  it("falls back to the full OAuth link when stored authorization is unavailable", async () => {
    const provider = {
      ...readyGsc(),
      drawer: {
        ...readyGsc().drawer,
        defaults: { ...readyGsc().drawer.defaults, login: "sc-domain:example.com" },
      },
      status: "connected" as const,
    };

    render(
      <ConnectDrawerOauth
        loadStoredProperties={async () => ({
          error: "Reconnect the Google account to load its properties.",
          properties: [],
          provider: "gsc",
          requiresReauth: true,
        })}
        projectId="prj_1"
        provider={provider}
        scopes={["webmasters"]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Change property" }));

    expect(
      await screen.findByText("Reconnect the Google account to load its properties."),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Use a different Google account" })).toHaveAttribute(
      "href",
      expect.stringContaining("/api/integrations/google/install"),
    );
  });

  it("does not start a reconnect flow while the project is read-only", () => {
    const provider = {
      ...readyGsc(),
      drawer: {
        ...readyGsc().drawer,
        defaults: { ...readyGsc().drawer.defaults, login: "sc-domain:example.com" },
      },
      status: "connected" as const,
    };

    render(
      <ProjectWriteModeProvider projectRef="prj_1" writeMode="migration_hold">
        <ConnectDrawerOauth
          loadStoredProperties={async () => ({ properties: [], provider: "gsc" })}
          projectId="prj_1"
          provider={provider}
          scopes={["webmasters"]}
        />
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByRole("button", { name: "Change property" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Reconnect account" })).not.toBeInTheDocument();
  });

  it("renders GA4 property options and enables connecting with the selected numeric id", () => {
    const provider = {
      ...readyGa4(),
      drawer: {
        ...readyGa4().drawer,
        googleOAuth: {
          properties: [
            {
              kind: "ga4" as const,
              label: "bisibility (123456789)",
              permissionLevel: "CorgiCorner",
              value: "123456789",
            },
          ],
          provider: "ga4" as const,
        },
      },
    };

    render(<ConnectDrawerOauth projectId="prj_1" provider={provider} scopes={["analytics"]} />);

    expect(screen.getByRole("button", { name: "Google Analytics property" })).toHaveTextContent(
      "bisibility (123456789)",
    );
    expect(screen.getByRole("button", { name: "Use selected property" })).toBeEnabled();
  });

  it("keeps Connect disabled and explains Measurement ID confusion for manual GA4 entry", () => {
    const provider = {
      ...readyGa4(),
      drawer: {
        ...readyGa4().drawer,
        googleOAuth: { properties: [], provider: "ga4" as const },
      },
    };

    render(<ConnectDrawerOauth projectId="prj_1" provider={provider} scopes={["analytics"]} />);

    const input = screen.getByLabelText("Google Analytics 4 property id");
    expect(input).toHaveAttribute("placeholder", "123456789");
    expect(screen.getByText(/Admin \(gear, bottom-left\).*Property details/s)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Property ID guide" })).toHaveAttribute(
      "href",
      "https://developers.google.com/analytics/devguides/reporting/data/v1/property-id",
    );
    expect(screen.getByRole("link", { name: "Measurement ID guide" })).toHaveAttribute(
      "href",
      "https://support.google.com/analytics/answer/12270356?hl=en",
    );
    fireEvent.change(input, { target: { value: "G-Y67LRWFT7X" } });
    fireEvent.blur(input);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Measurement ID for a web data stream, not a Google Analytics 4 Property ID",
    );
    expect(screen.getByRole("button", { name: "Use entered property" })).toBeDisabled();
  });
});
