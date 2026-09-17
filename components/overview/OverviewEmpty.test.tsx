import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { ProjectWriteModeProvider } from "@/components/shell/ProjectWriteModeProvider";
import type { AppLocale } from "@/i18n/config";
import { canProjectAction } from "@/lib/auth/capabilities";
import type { ProjectWriteMode } from "@/lib/deployment/project-write-mode";
import type { Role } from "@/lib/generated/prisma/client";
import messages from "@/messages/core/en/project-dashboard.json";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import type { GettingStartedProgress } from "./getting-started";
import { OverviewEmpty } from "./OverviewEmpty";

const progress: GettingStartedProgress = {
  gscOAuthConfigured: true,
  hasAnalyticsSource: false,
  hasCheck: false,
  hasKeywords: false,
  projectId: "prj_1",
  providerConnected: false,
};

type RenderOptions = {
  addKeywordsAction?: Parameters<typeof OverviewEmpty>[0]["addKeywordsAction"];
  importTopQueriesAction?: Parameters<typeof OverviewEmpty>[0]["importTopQueriesAction"];
  locale?: AppLocale;
  messages?: AbstractIntlMessages;
  writeMode?: ProjectWriteMode;
};

function renderEmpty(
  overrides: Partial<GettingStartedProgress> = {},
  role: Role = "owner",
  workspaceName = "RBAC Matrix Test",
  {
    addKeywordsAction,
    importTopQueriesAction,
    locale = "en",
    messages: scopedMessages = messages,
    writeMode = "active",
  }: RenderOptions = {},
) {
  return render(
    <FeatureMessagesProvider locale={locale} messages={scopedMessages} timeZone="UTC">
      <ProjectWriteModeProvider projectRef="prj_1" writeMode={writeMode}>
        <OverviewEmpty
          addKeywordsAction={addKeywordsAction}
          capabilities={{
            canCreateKeywords: canProjectAction(role, "create", "keyword"),
            canInstallSampleData: true,
            canManageImports: canProjectAction(role, "manage", "cloud_import_job"),
            canManageProviders: canProjectAction(role, "manage", "provider_connection"),
          }}
          gettingStarted={{ ...progress, ...overrides }}
          importTopQueriesAction={importTopQueriesAction}
          workspaceName={workspaceName}
        />
      </ProjectWriteModeProvider>
    </FeatureMessagesProvider>,
  );
}

describe("OverviewEmpty", () => {
  it.each(["viewer", "auditor", "member", "admin", "owner"] satisfies Role[])(
    "renders the initial data-source stage for the %s role at the matrix thresholds",
    (role) => {
      const canCreateKeywords = canProjectAction(role, "create", "keyword");
      const canManageImports = canProjectAction(role, "manage", "cloud_import_job");
      const canManageProviders = canProjectAction(role, "manage", "provider_connection");

      renderEmpty({}, role);

      expect(screen.getByText("Welcome to RBAC Matrix Test")).toBeVisible();
      expect(
        screen.getByText(
          "This project is empty. One step at a time gets you to your first rankings.",
        ),
      ).toBeVisible();
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

  it("uses its injected non-English messages for the named first-run view", () => {
    const nonEnglishMessages = {
      ...messages,
      projectDashboard: {
        ...messages.projectDashboard,
        emptyOnboarding: {
          ...messages.projectDashboard.emptyOnboarding,
          connect: {
            ...messages.projectDashboard.emptyOnboarding.connect,
            alternatives:
              "Tus propios datos: <provider>Usa un proveedor SERP</provider>{canCreateKeywords, select, true { o <manual>añade palabras clave manualmente</manual>} other {}}.",
            title: "Conecta Search Console",
          },
          heading: {
            ...messages.projectDashboard.emptyOnboarding.heading,
            workspace: "Bienvenido a {workspaceName}",
          },
          step: "Paso {current, number} de {total, number}",
        },
      },
    };

    renderEmpty({}, "owner", "Vega Labs", {
      locale: "es-ES" as AppLocale,
      messages: nonEnglishMessages,
    });

    expect(screen.getByText("Bienvenido a Vega Labs")).toBeVisible();
    expect(screen.getByText("Paso 1 de 3")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Conecta Search Console" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Usa un proveedor SERP" })).toHaveAttribute(
      "href",
      "/app/prj_1/integrations",
    );
    expect(screen.queryByText("Welcome to Vega Labs")).not.toBeInTheDocument();
  });

  it("greets generically while the project still has its creation-default name", () => {
    renderEmpty({}, "owner", "New project");

    expect(screen.getByText("Welcome to your new project")).toBeVisible();
  });

  it("labels the Google Cloud Console detour honestly when OAuth is not configured", () => {
    renderEmpty({ gscOAuthConfigured: false });

    expect(screen.getByRole("link", { name: "Set up Google OAuth" })).toHaveAttribute(
      "href",
      "https://console.cloud.google.com/apis/credentials",
    );
    expect(screen.queryByRole("link", { name: "Connect Search Console" })).toBeNull();
  });

  it("falls back to manual keyword entry when top-query actions are unavailable", () => {
    renderEmpty({ hasAnalyticsSource: true });

    expect(screen.getByText("Step 2 of 3")).toBeVisible();
    expect(screen.getByRole("link", { name: "Add keywords" })).toHaveAttribute(
      "href",
      "/app/prj_1/rank-tracker?add=1",
    );
    expect(screen.queryByRole("button", { name: "Import your top queries" })).toBeNull();
  });

  it("shows localized loading and source failure feedback while importing top queries", async () => {
    let resolveImport: ((value: { queries: []; reason: "no_source" }) => void) | undefined;
    const importTopQueriesAction = vi.fn(
      () =>
        new Promise<{ queries: []; reason: "no_source" }>((resolve) => {
          resolveImport = resolve;
        }),
    );

    renderEmpty({ hasAnalyticsSource: true }, "owner", "RBAC Matrix Test", {
      addKeywordsAction: vi.fn(),
      importTopQueriesAction,
    });

    fireEvent.click(screen.getByRole("button", { name: "Import your top queries" }));
    expect(screen.getByText("Loading queries...")).toBeVisible();
    expect(importTopQueriesAction).toHaveBeenCalledWith({ limit: 50, projectId: "prj_1" });

    resolveImport?.({ queries: [], reason: "no_source" });

    expect(await screen.findByRole("status")).toHaveTextContent(
      "No Search Console source is connected.",
    );
  });

  it("keeps distinct empty-result, reauthorization, and unexpected import errors", async () => {
    const importTopQueriesAction = vi
      .fn()
      .mockResolvedValueOnce({ queries: [], reason: "needs_reauth" })
      .mockResolvedValueOnce({ queries: [], suggestions: [] })
      .mockRejectedValueOnce(new Error("Provider timeout"));

    renderEmpty({ hasAnalyticsSource: true }, "owner", "RBAC Matrix Test", {
      addKeywordsAction: vi.fn(),
      importTopQueriesAction,
    });

    const action = screen.getByRole("button", { name: "Import your top queries" });
    fireEvent.click(action);
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Google authorization has expired. Reconnect it under Integrations.",
    );

    fireEvent.click(action);
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "No queries observed yet - new Search Console properties can take a few days.",
      ),
    );

    fireEvent.click(action);
    expect(await screen.findByRole("status")).toHaveTextContent("Provider timeout");
  });

  it("keeps the top-query action hidden in the project read-only mode", () => {
    const importTopQueriesAction = vi.fn();
    renderEmpty({ hasAnalyticsSource: true }, "owner", "RBAC Matrix Test", {
      addKeywordsAction: vi.fn(),
      importTopQueriesAction,
      writeMode: "migrated",
    });

    expect(screen.queryByRole("button", { name: "Import your top queries" })).toBeNull();
    expect(screen.getByRole("link", { name: "Add keywords" })).toBeVisible();
    expect(importTopQueriesAction).not.toHaveBeenCalled();
  });

  it("keeps the sample and self-host alternatives at the capability boundary", () => {
    renderEmpty({}, "owner");

    expect(screen.getByRole("button", { name: "Load sample project" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Import your data" })).toHaveAttribute(
      "href",
      "/cloud/import?ctx=settings&project=prj_1",
    );
  });

  it("announces the completed automatic-check stage as a named heading", () => {
    renderEmpty({ hasKeywords: true, providerConnected: true });

    expect(screen.getByText("Step 3 of 3")).toBeVisible();
    expect(screen.getByRole("heading", { name: "First check runs automatically" })).toBeVisible();
    expect(
      screen.getByText(
        "Positions, trends and highlights appear here after it completes - no action needed.",
      ),
    ).toBeVisible();
    expect(screen.queryByRole("link", { name: "Add keywords" })).toBeNull();
  });
});
