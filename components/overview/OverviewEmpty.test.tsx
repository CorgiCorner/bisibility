import { canProjectAction } from "@/lib/auth/capabilities";
import type { Role } from "@/lib/generated/prisma/client";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OverviewEmpty } from "./OverviewEmpty";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const progress = {
  gscOAuthConfigured: true,
  hasAnalyticsSource: false,
  hasCheck: false,
  hasKeywords: false,
  projectId: "prj_1",
  providerConnected: false,
};

describe("OverviewEmpty", () => {
  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders setup actions for the %s role at the matrix thresholds",
    (role) => {
      const canCreateKeywords = canProjectAction(role, "create", "keyword");
      const canManageImports = canProjectAction(role, "manage", "cloud_import_job");
      const canManageProviders = canProjectAction(role, "manage", "provider_connection");

      render(
        <OverviewEmpty
          capabilities={{
            canCreateKeywords,
            canInstallSampleData: true,
            canManageImports,
            canManageProviders,
          }}
          gettingStarted={progress}
          workspaceName="RBAC Matrix Test"
        />,
      );

      expect(screen.getByText("Welcome to RBAC Matrix Test")).toBeVisible();
      expect(Boolean(screen.queryByRole("link", { name: "Search Console (free)" }))).toBe(
        canManageProviders,
      );
      expect(Boolean(screen.queryByRole("link", { name: "SERP provider" }))).toBe(
        canManageProviders,
      );
      expect(Boolean(screen.queryByRole("link", { name: "Add" }))).toBe(canCreateKeywords);
      expect(screen.getByRole("button", { name: "Load sample project" })).toBeVisible();
      expect(Boolean(screen.queryByRole("link", { name: "Import" }))).toBe(canManageImports);
    },
  );
});
