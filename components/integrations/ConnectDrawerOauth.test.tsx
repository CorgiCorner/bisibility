import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import { searchSyncPlanSummary } from "@/lib/search-insights/sync/plan";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConnectDrawerOauth } from "./ConnectDrawerOauth";
import { ConnectDrawerOauthSelection } from "./ConnectDrawerOauthSelection";
import { integrationCategories } from "./integrations-fixtures";

vi.mock("@/lib/search-insights/sync/plan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/search-insights/sync/plan")>();
  return { ...actual, searchSyncPlanSummary: vi.fn(actual.searchSyncPlanSummary) };
});

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
    render(
      <ConnectDrawerOauth
        projectId="prj_1"
        provider={readyGsc()}
        scopes={["webmasters"]}
        syncPlan={{ daysTotal: 93, pace: "gentle", retentionMonths: 3 }}
      />,
    );

    expect(screen.queryByLabelText("Search Console property")).not.toBeInTheDocument();
    const connectLink = screen.getByRole("link", { name: "Connect Google account" });
    expect(connectLink).toHaveAttribute("href", expect.not.stringContaining("property="));
    const oauthCallout = screen.getByRole("note", {
      name: /Google OAuth handles access for this connection/i,
    });
    expect(oauthCallout).toHaveTextContent("No API key is required.");
    expect(oauthCallout).toHaveAttribute("data-tint", "neutral");
    expect(oauthCallout).toHaveClass("border-border");
    expect(oauthCallout).not.toHaveClass("border-border-control");
  });

  it("shows the settings-derived Search Console import plan during property selection", () => {
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
          provider: "gsc" as const,
        },
      },
    };

    render(
      <ConnectDrawerOauth
        projectId="prj_1"
        provider={provider}
        scopes={["webmasters"]}
        syncPlan={{ daysTotal: 93, pace: "gentle", retentionMonths: 3 }}
      />,
    );

    expect(screen.getByText(/Importing 3 months takes about 400 requests/)).toBeInTheDocument();
  });

  it("submits the in-form GSC depth and speed after updating the estimate locally", async () => {
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
          provider: "gsc" as const,
        },
      },
    };

    render(
      <ConnectDrawerOauth
        completePropertySelection={completePropertySelection}
        projectId="prj_1"
        provider={provider}
        scopes={["webmasters"]}
        syncPlan={{ daysTotal: 488, pace: "normal", retentionMonths: 16 }}
      />,
    );

    expect(screen.getByRole("button", { name: "Import depth" })).toHaveTextContent("16 months");
    expect(screen.getByRole("button", { name: "Import speed" })).toHaveTextContent("Standard");
    vi.mocked(searchSyncPlanSummary).mockClear();

    fireEvent.click(screen.getByRole("button", { name: "Import depth" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "6 months" }));
    fireEvent.click(screen.getByRole("button", { name: "Import speed" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Reduced" }));

    expect(
      screen.getByText(
        "Importing 6 months takes about 700 requests to Google. First view in ~9 min; full history in ~1.5 days at Reduced speed.",
      ),
    ).toBeInTheDocument();
    expect(searchSyncPlanSummary).toHaveBeenLastCalledWith({
      pace: "gentle",
      retentionMonths: 6,
    });

    fireEvent.click(screen.getByRole("button", { name: "Use selected property" }));
    await waitFor(() =>
      expect(completePropertySelection).toHaveBeenCalledWith({
        pace: "gentle",
        projectId: "prj_1",
        property: "sc-domain:example.com",
        retentionMonths: 6,
      }),
    );
  });

  it("does not show Search Console request estimates for GA4", () => {
    const provider = {
      ...readyGa4(),
      drawer: {
        ...readyGa4().drawer,
        googleOAuth: {
          properties: [
            {
              kind: "ga4" as const,
              label: "Analytics property (123456789)",
              permissionLevel: "owner",
              value: "123456789",
            },
          ],
          provider: "ga4" as const,
        },
      },
    };

    render(
      <ConnectDrawerOauth
        projectId="prj_1"
        provider={provider}
        scopes={["analytics"]}
        syncPlan={undefined}
      />,
    );

    expect(screen.queryByText(/requests to Google/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Importing .* months/)).not.toBeInTheDocument();
  });

  it("uses the public project ref in the OAuth return path", () => {
    render(
      <ConnectDrawerOauth
        projectId="project_internal_1"
        projectRef="prj_public_1"
        provider={readyGsc()}
        scopes={["webmasters"]}
        syncPlan={{ daysTotal: 93, pace: "gentle", retentionMonths: 3 }}
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
        syncPlan={{ daysTotal: 93, pace: "gentle", retentionMonths: 3 }}
      />,
    );

    expect(screen.getByRole("button", { name: "Search Console property" })).toHaveTextContent(
      "example.com",
    );
    fireEvent.click(screen.getByRole("button", { name: "Use selected property" }));

    await waitFor(() =>
      expect(completePropertySelection).toHaveBeenCalledWith({
        pace: "gentle",
        projectId: "prj_1",
        property: "sc-domain:example.com",
        retentionMonths: 3,
      }),
    );
    expect(await screen.findByText("Connected to example.com")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Connected to sc-domain:");
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

    render(
      <ConnectDrawerOauth
        projectId="prj_1"
        provider={provider}
        scopes={["webmasters"]}
        syncPlan={{ daysTotal: 93, pace: "gentle", retentionMonths: 3 }}
      />,
    );

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
        syncPlan={{ daysTotal: 93, pace: "gentle", retentionMonths: 3 }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Change property" }));
    expect(
      await screen.findByRole("button", { name: "Search Console property" }),
    ).toHaveTextContent("example.com");
    fireEvent.click(screen.getByRole("button", { name: "Use selected property" }));

    await waitFor(() =>
      expect(saveStoredProperty).toHaveBeenCalledWith({
        pace: "gentle",
        projectId: "prj_1",
        property: "sc-domain:example.com",
        provider: "gsc",
        retentionMonths: 3,
      }),
    );
    expect(screen.getByRole("link", { name: "Reconnect account" })).toHaveAttribute(
      "href",
      expect.stringContaining("/api/integrations/google/install"),
    );
    expect(screen.queryByRole("link", { name: "Switch account" })).toBeNull();
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
        syncPlan={{ daysTotal: 93, pace: "gentle", retentionMonths: 3 }}
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
          syncPlan={{ daysTotal: 93, pace: "gentle", retentionMonths: 3 }}
        />
      </ProjectWriteModeProvider>,
    );

    expect(screen.getByRole("button", { name: "Change property" })).toBeDisabled();
    expect(screen.queryByRole("link", { name: "Reconnect account" })).not.toBeInTheDocument();
  });

  it("keeps connected GSC idle until Change property and Cancel restores idle without saving", async () => {
    const loadStoredProperties = vi.fn(async () => ({
      archivedProperties: [],
      preferredProperty: "sc-domain:example.com",
      projectDomain: "example.com",
      properties: [
        {
          kind: "domain" as const,
          label: "example.com",
          permissionLevel: "siteOwner",
          value: "sc-domain:example.com",
        },
      ],
      provider: "gsc" as const,
    }));
    const saveStoredProperty = vi.fn();
    const provider = {
      ...readyGsc(),
      drawer: {
        ...readyGsc().drawer,
        accountEmail: "owner@example.com",
        defaults: { ...readyGsc().drawer.defaults, login: "sc-domain:example.com" },
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
        syncPlan={{ daysTotal: 93, pace: "gentle", retentionMonths: 3 }}
      />,
    );

    expect(screen.getByText("owner@example.com")).toBeInTheDocument();
    expect(screen.queryByText(/Connected as/)).not.toBeInTheDocument();
    expect(screen.getByText("Search Console property for this project")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Search Console property" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Choose from the Search Console properties/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Change property" }));
    expect(await screen.findByRole("button", { name: "Search Console property" })).toBeVisible();
    expect(
      screen.getByText("Choose from the Search Console properties verified for that account."),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("button", { name: "Search Console property" }),
    ).not.toBeInTheDocument();
    expect(saveStoredProperty).not.toHaveBeenCalled();
  });

  it("groups canonical GSC choices once with stable badges and unavailable archived metadata", async () => {
    const provider = {
      ...readyGsc(),
      drawer: {
        ...readyGsc().drawer,
        defaults: { ...readyGsc().drawer.defaults, login: "https://example.com/path" },
      },
      status: "connected" as const,
    };
    render(
      <ConnectDrawerOauth
        loadStoredProperties={async () => ({
          archivedProperties: [
            {
              kind: "domain",
              label: "archive.example.com",
              lastSyncedDate: "2026-08-20",
              permissionLevel: "",
              value: "sc-domain:archive.example.com",
            },
            {
              kind: "url-prefix",
              label: "https://old.example.com/path",
              lastSyncedDate: "2026-08-19",
              permissionLevel: "",
              value: "https://old.example.com/path",
            },
          ],
          preferredProperty: "https://example.com/path",
          projectDomain: "example.com",
          properties: [
            {
              kind: "url-prefix",
              label: "Example path",
              permissionLevel: "siteOwner",
              value: "https://example.com/path",
            },
            {
              kind: "url-prefix",
              label: "Duplicate label",
              permissionLevel: "siteOwner",
              value: "https://example.com/path",
            },
            {
              kind: "domain",
              label: "archive.example.com",
              permissionLevel: "siteOwner",
              value: "sc-domain:archive.example.com",
            },
            {
              kind: "domain",
              label: "example.com",
              permissionLevel: "siteOwner",
              value: "sc-domain:example.com",
            },
            {
              kind: "url-prefix",
              label: "Other",
              permissionLevel: "siteOwner",
              value: "https://other.example.org/path",
            },
          ],
          provider: "gsc",
        })}
        projectId="prj_1"
        provider={provider}
        saveStoredProperty={vi.fn()}
        scopes={["webmasters"]}
        syncPlan={{ daysTotal: 93, pace: "gentle", retentionMonths: 3 }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Change property" }));
    const trigger = await screen.findByRole("button", { name: "Search Console property" });
    expect(trigger).toHaveTextContent("https://example.com/path");
    expect(trigger).toHaveTextContent("URL PREFIX");
    fireEvent.click(trigger);

    expect(screen.getAllByText("Active")).toHaveLength(1);
    expect(screen.getByText("Archived")).toBeInTheDocument();
    expect(screen.getByText("Matches this project")).toBeInTheDocument();
    expect(screen.getByText("Other properties")).toBeInTheDocument();
    const options = screen.getAllByRole("menuitem");
    expect(
      options.filter((option) => option.textContent?.includes("https://example.com/path")),
    ).toHaveLength(1);
    expect(
      options.every((option) => option.querySelector('[data-slot="menu-option-trailing"]')),
    ).toBe(true);
    expect(screen.getByText(/last synced 2026-08-19/i)).toBeInTheDocument();
    expect(screen.getByText(/Not available to this Google account/i)).toBeInTheDocument();
  });

  it("uses truthful connected copy, granted scopes, Logo.dev, and icon-free ghost reconnect", () => {
    const provider = {
      ...readyGsc(),
      logoDomain: "google.com",
      drawer: {
        ...readyGsc().drawer,
        accountEmail: undefined,
        activities: [{ label: "Settings changed", value: "just now" }],
        defaults: { ...readyGsc().drawer.defaults, login: "sc-domain:example.com" },
      },
      status: "connected" as const,
    };
    const { container } = render(
      <ConnectDrawerOauth
        loadStoredProperties={vi.fn()}
        projectId="prj_1"
        provider={provider}
        saveStoredProperty={vi.fn()}
        scopes={["webmasters"]}
        syncPlan={{ daysTotal: 93, pace: "gentle", retentionMonths: 3 }}
      />,
    );

    expect(screen.getByText("Google account connected")).toBeInTheDocument();
    expect(screen.getByText("example.com")).toBeInTheDocument();
    expect(screen.getByText("DOMAIN")).toBeInTheDocument();
    const connectedSummary = screen.getByText("Selected property").closest("div.rounded-control");
    expect(connectedSummary).toHaveClass("border-border");
    expect(connectedSummary).not.toHaveClass("border-green");
    expect(container).not.toHaveTextContent("sc-domain:");
    expect(screen.getByText("Access granted:")).toBeInTheDocument();
    expect(screen.queryByText("Connection")).not.toBeInTheDocument();
    expect(screen.queryByText("Settings changed")).not.toBeInTheDocument();
    expect((container.textContent ?? "").replace(/\s+/g, " ").trim()).not.toMatch(
      /Recent activity|Last sync|Never|Connection state|Enabled/,
    );
    expect(screen.getByRole("img", { name: "Google logo" })).toBeInTheDocument();
    const reconnectAccount = screen.getByRole("link", { name: "Reconnect account" });
    expect(reconnectAccount.querySelector("svg")).toBeNull();
    expect(getComputedStyle(reconnectAccount).borderStyle).toBe("none");
    const footer = reconnectAccount.closest('[data-slot="connected-google-account-footer"]');
    expect(footer).toHaveClass("border-t", "border-border", "pt-3");
    expect(footer).not.toHaveTextContent("·");
    expect(screen.queryByRole("link", { name: "Switch account" })).toBeNull();
  });

  it("uses the GA4 property label, concise ID metadata, and a clean happy-path footer", () => {
    const provider = {
      ...readyGa4(),
      drawer: {
        ...readyGa4().drawer,
        googleOAuth: {
          properties: [
            {
              kind: "ga4" as const,
              label: "AlphaHero",
              permissionLevel: "owner",
              value: "419395686",
            },
          ],
          provider: "ga4" as const,
        },
      },
    };

    render(
      <ConnectDrawerOauth
        projectId="prj_1"
        provider={provider}
        scopes={["analytics"]}
        syncPlan={undefined}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Google Analytics property" });
    expect(trigger).toHaveTextContent("AlphaHero");
    expect(trigger).toHaveTextContent("GA4");
    expect(trigger).not.toHaveTextContent("419395686");
    expect(screen.getByTitle("419395686")).toHaveTextContent("419395686");
    expect(screen.getByRole("button", { name: "Copy property ID" })).toBeVisible();
    expect(screen.queryByText("Google Analytics property")).not.toBeInTheDocument();

    const rescue = screen.getByRole("button", { name: "I don't see my property" });
    const primary = screen.getByRole("button", { name: "Use selected property" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    const footer = primary.parentElement;
    expect(rescue).toHaveAttribute("data-variant", "ghost");
    expect(rescue).not.toHaveAttribute("data-variant", "secondary");
    expect(rescue).not.toHaveClass("w-full");
    expect(
      rescue.compareDocumentPosition(footer as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(footer).toHaveTextContent("CancelUse selected property");
    expect(footer).not.toHaveTextContent("I don't see my property");
    expect(cancel.compareDocumentPosition(primary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("hides the GA4 picker and selected metadata while manual entry owns validation", () => {
    render(
      <ConnectDrawerOauthSelection
        allowManualEntry
        isGa4
        manualEntry
        onCancel={vi.fn()}
        onManualEntryChange={vi.fn()}
        onPropertyChange={vi.fn()}
        onPropertyErrorChange={vi.fn()}
        onSelect={vi.fn()}
        pending={false}
        property="not-a-property-id"
        propertyError="Enter a numeric Google Analytics 4 Property ID."
        readOnly={false}
        setup={{
          properties: [
            {
              kind: "ga4",
              label: "AlphaHero",
              permissionLevel: "owner",
              value: "419395686",
            },
          ],
          provider: "ga4",
        }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Google Analytics property" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Copy property ID" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Google Analytics 4 property id")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a numeric Google Analytics 4 Property ID.",
    );
  });

  it("shows value-oriented property metadata and keeps the primary selection action last", () => {
    const provider = {
      ...readyGsc(),
      drawer: {
        ...readyGsc().drawer,
        googleOAuth: {
          accountEmail: "owner@example.com",
          properties: [
            {
              kind: "domain" as const,
              label: "example.com",
              permissionLevel: "siteOwner",
              value: "sc-domain:example.com",
            },
          ],
          provider: "gsc" as const,
        },
      },
    };

    render(
      <ConnectDrawerOauth
        projectId="prj_1"
        provider={provider}
        scopes={["webmasters"]}
        syncPlan={{ daysTotal: 93, pace: "gentle", retentionMonths: 3 }}
      />,
    );

    const metadata = screen.getByText("Owner · Domain property");
    expect(metadata).toHaveClass("mt-1.5", "text-[11.5px]", "text-fg-muted");
    const primary = screen.getByRole("button", { name: "Use selected property" });
    const cancel = screen.getByRole("button", { name: "Cancel" });
    expect(primary.parentElement).toHaveClass("justify-end");
    expect(primary).not.toHaveClass("ml-auto");
    expect(cancel.compareDocumentPosition(primary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("omits the secondary action slot when selection has no secondary controls", () => {
    render(
      <ConnectDrawerOauthSelection
        allowManualEntry={false}
        isGa4
        manualEntry={false}
        onManualEntryChange={vi.fn()}
        onPropertyChange={vi.fn()}
        onPropertyErrorChange={vi.fn()}
        onSelect={vi.fn()}
        pending={false}
        property="123456789"
        propertyError={null}
        readOnly={false}
        setup={{
          properties: [
            {
              kind: "ga4",
              label: "Store (123456789)",
              permissionLevel: "owner",
              value: "123456789",
            },
          ],
          provider: "ga4",
        }}
      />,
    );

    const primary = screen.getByRole("button", { name: "Use selected property" });
    expect(primary.parentElement).toHaveClass("justify-end");
    expect(
      primary.parentElement?.querySelector('[data-slot="selection-secondary-actions"]'),
    ).toBeNull();
  });

  it("validates manual GA4 entry only after interaction with concise errors", () => {
    const provider = {
      ...readyGa4(),
      drawer: {
        ...readyGa4().drawer,
        googleOAuth: { properties: [], provider: "ga4" as const },
      },
    };

    render(
      <ConnectDrawerOauth
        projectId="prj_1"
        provider={provider}
        scopes={["analytics"]}
        syncPlan={undefined}
      />,
    );

    const input = screen.getByLabelText("Google Analytics 4 property id");
    expect(input).not.toHaveAttribute("placeholder");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/Admin \(gear, bottom-left\).*Property details/s)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Property ID guide" })).toHaveAttribute(
      "href",
      "https://developers.google.com/analytics/devguides/reporting/data/v1/property-id",
    );
    expect(
      screen.getByRole("link", { name: "Property ID guide" }).querySelector("svg"),
    ).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("link", { name: "Measurement ID guide" })).toHaveAttribute(
      "href",
      "https://support.google.com/analytics/answer/12270356?hl=en",
    );
    expect(
      screen.getByRole("link", { name: "Measurement ID guide" }).querySelector("svg"),
    ).toHaveAttribute("aria-hidden", "true");
    fireEvent.blur(input);
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a Property ID first.");

    fireEvent.change(input, { target: { value: "G-Y67LRWFT7X" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.blur(input);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "G-Y67LRWFT7X is a Measurement ID. You need the numeric Property ID - they live on the same Google Analytics screen.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("Admin");

    fireEvent.change(input, { target: { value: "not-a-property" } });
    fireEvent.blur(input);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "not-a-property is not a Property ID. Property IDs are digits only - see the note above for where to find yours.",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent("Admin");
    expect(screen.getByRole("button", { name: "Use entered property" })).toBeDisabled();
  });
});
