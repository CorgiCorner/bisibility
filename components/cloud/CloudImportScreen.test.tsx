import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { cloudImportFeatureTestMessages } from "@/i18n/test-support/render-with-feature-messages";
import { useTranslations } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCloudImportView: vi.fn(),
  getResolvedDateFormat: vi.fn(),
  headers: vi.fn(),
  loadCoreMessages: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
}));

vi.mock("@/lib/actions/cloud", () => ({
  mintMigrationTokenResult: vi.fn(),
  pollCloudImportJob: vi.fn(),
  regenerateMigrationTokenResult: vi.fn(),
  revokeMigrationTokenResult: vi.fn(),
}));
vi.mock("@/lib/dates/request", () => ({ getResolvedDateFormat: mocks.getResolvedDateFormat }));
vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: () => "cloud" }));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));
vi.mock("@/lib/migration/destination-origin", () => ({
  migrationDestinationOrigin: () => "https://app.example.com",
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("@/lib/queries/cloud", () => ({ getCloudImportView: mocks.getCloudImportView }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("./CloudImport", () => ({
  CloudImport: ({ source }: { source: "instance" | "selfHost" }) => {
    const t = useTranslations("cloudImport.token");
    const display = useDateDisplay();
    return (
      <output data-source={source} data-testid="cloud-import-client-boundary">
        {t("header")}:{display.locale}:{display.timeZone}:{display.dateFormat}
      </output>
    );
  },
}));

import { CloudImportScreen } from "./CloudImportScreen";

describe("CloudImportScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const messages = structuredClone(cloudImportFeatureTestMessages);
    messages.cloudImport.screen.cloudTitle = "Importuj z hosta";
    messages.cloudImport.token.header = "Token migracji";
    mocks.getCloudImportView.mockResolvedValue({
      activeToken: null,
      importJob: {
        counts: null,
        createdAt: null,
        error: null,
        finishedAt: null,
        id: null,
        progress: 0,
        startedAt: null,
        state: "idle",
      },
      project: {
        domain: "example.com",
        id: "project_1",
        name: "Project one",
        publicId: "prj_abcdefghijklmnopqrstuvwx",
        writeMode: "active",
      },
    });
    mocks.getResolvedDateFormat.mockResolvedValue({ preference: "auto", resolved: "day_first" });
    mocks.headers.mockResolvedValue(new Headers());
    mocks.loadCoreMessages.mockResolvedValue(messages);
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "user_1", memberships: [{ projectId: "project_1", role: "admin" }] },
      project: { id: "project_1" },
    });
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({
      locale: "pl",
      timeZone: "Europe/Warsaw",
    });
  });

  it("injects the request locale and date format through the hosted import boundary", async () => {
    const screen = await CloudImportScreen({
      context: "cloud-settings",
      projectRef: "prj_abcdefghijklmnopqrstuvwx",
    });

    const markup = renderToStaticMarkup(screen);

    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("pl", ["shared", "cloudImport"]);
    expect(mocks.getResolvedDateFormat).toHaveBeenCalledOnce();
    expect(markup).toContain("Importuj z hosta");
    expect(markup).toContain("Token migracji:pl:Europe/Warsaw:day_first");
    expect(markup).toContain('data-source="selfHost"');
  });
});
