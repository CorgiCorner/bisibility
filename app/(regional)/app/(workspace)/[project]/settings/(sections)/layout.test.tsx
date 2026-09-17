import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadCoreMessages: vi.fn(),
  providerProps: undefined as unknown,
  resolveRegionalDocumentLocale: vi.fn(),
}));

vi.mock("@/components/i18n/FeatureMessagesProvider", () => ({
  FeatureMessagesProvider: (props: { children: ReactNode }) => {
    mocks.providerProps = props;
    return <>{props.children}</>;
  },
}));
vi.mock("@/i18n/catalog-loader.server", () => ({ loadCoreMessages: mocks.loadCoreMessages }));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));

import SettingsSectionsLayout from "@/app/(regional)/app/(workspace)/[project]/settings/(sections)/layout";

describe("SettingsSectionsLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({
      locale: "en",
      messages: { shared: {} },
      timeZone: "UTC",
    });
    mocks.loadCoreMessages.mockResolvedValue({ projectSettingsShell: {}, shared: {} });
  });

  it("loads only the shared and settings-shell catalogs for every section route", async () => {
    render(
      await SettingsSectionsLayout({
        children: <p>General settings</p>,
      }),
    );

    expect(mocks.loadCoreMessages).toHaveBeenCalledWith("en", ["shared", "projectSettingsShell"]);
    expect(mocks.providerProps).toEqual(
      expect.objectContaining({
        locale: "en",
        messages: { projectSettingsShell: {}, shared: {} },
        timeZone: "UTC",
      }),
    );
  });
});
