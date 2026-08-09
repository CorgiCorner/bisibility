import { canProjectAction } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GettingStartedProgress } from "./getting-started";
import { OverviewEmpty } from "./OverviewEmpty";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const progress: GettingStartedProgress = {
  gscOAuthConfigured: true,
  hasAnalyticsSource: false,
  hasCheck: false,
  hasKeywords: false,
  projectId: "prj_1",
  providerConnected: false,
};

function renderEmpty(
  overrides: Partial<GettingStartedProgress> = {},
  role: Role = "owner",
  workspaceName = "RBAC Matrix Test",
) {
  return render(
    <OverviewEmpty
      capabilities={{
        canCreateKeywords: canProjectAction(role, "create", "keyword"),
        canInstallSampleData: true,
        canManageImports: canProjectAction(role, "manage", "cloud_import_job"),
        canManageProviders: canProjectAction(role, "manage", "provider_connection"),
      }}
      gettingStarted={{ ...progress, ...overrides }}
      workspaceName={workspaceName}
    />,
  );
}

describe("OverviewEmpty", () => {
  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders the connect stage for the %s role at the matrix thresholds",
    (role) => {
      const canCreateKeywords = canProjectAction(role, "create", "keyword");
      const canManageImports = canProjectAction(role, "manage", "cloud_import_job");
      const canManageProviders = canProjectAction(role, "manage", "provider_connection");

      renderEmpty({}, role);

      expect(screen.getByText("Welcome to RBAC Matrix Test")).toBeVisible();
      expect(screen.getByText("Step 1 of 3")).toBeVisible();
      expect(Boolean(screen.queryByRole("link", { name: "Connect Search Console" }))).toBe(
        canManageProviders,
      );
      expect(Boolean(screen.queryByRole("link", { name: "Use a SERP provider" }))).toBe(
        canManageProviders,
      );
      expect(Boolean(screen.queryByRole("link", { name: "add keywords manually" }))).toBe(
        canManageProviders && canCreateKeywords,
      );
      expect(screen.getByRole("button", { name: "Load sample project" })).toBeVisible();
      expect(Boolean(screen.queryByRole("link", { name: "Import your data" }))).toBe(
        canManageImports,
      );
    },
  );

  it("greets generically while the project still has its creation-default name", () => {
    renderEmpty({}, "owner", "New project");

    expect(screen.getByText("Welcome to your new project")).toBeVisible();
  });

  it("labels the Google Cloud Console detour honestly when OAuth is not configured", () => {
    renderEmpty({ gscOAuthConfigured: false });

    expect(screen.getByRole("link", { name: "Set up Google OAuth" })).toBeVisible();
    expect(screen.queryByRole("link", { name: "Connect Search Console" })).toBeNull();
  });

  it("offers the top-query import once an analytics source is connected", () => {
    renderEmpty({ hasAnalyticsSource: true });

    expect(screen.getByText("Step 2 of 3")).toBeVisible();
    // Both actions are wired in the page; without them the card falls back to manual add.
    expect(screen.getByRole("link", { name: "Add keywords" })).toBeVisible();
  });

  it("prefers the top-query import when the seeding actions are wired", () => {
    render(
      <OverviewEmpty
        addKeywordsAction={vi.fn()}
        capabilities={{
          canCreateKeywords: true,
          canInstallSampleData: true,
          canManageImports: true,
          canManageProviders: true,
        }}
        gettingStarted={{ ...progress, hasAnalyticsSource: true }}
        importTopQueriesAction={vi.fn()}
        workspaceName="Vega Labs"
      />,
    );

    expect(screen.getByRole("button", { name: "Import your top queries" })).toBeVisible();
    expect(screen.getByRole("link", { name: "add keywords manually" })).toBeVisible();
  });

  it("shows the passive final stage once keywords exist", () => {
    renderEmpty({ hasKeywords: true, providerConnected: true });

    expect(screen.getByText("Step 3 of 3")).toBeVisible();
    expect(screen.getByText("First check runs automatically")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Add keywords" })).toBeNull();
  });
});
