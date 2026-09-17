import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { IntegrationProviderData } from "@/lib/integrations/types";
import polishIntegrationsMessages from "@/messages/core/pl/project-integrations.json";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { integrationCategories } from "./integrations-fixtures";
import { ProviderCardMeta } from "./ProviderCardMeta";

const base = integrationCategories[0].providers[0] as IntegrationProviderData;

const provider: IntegrationProviderData = {
  ...base,
  meta: [
    {
      labelKey: "lastRankCheck",
      relativeTo: "2026-02-02T12:00:00.000Z",
      valueAt: "2025-11-04T12:00:00.000Z",
    },
    { labelKey: "state", valueKey: "enabled" },
  ],
  status: "connected",
};

describe("the provider card metadata in a non-English locale", () => {
  it("translates the metric label and renders the elapsed time in the viewer locale", () => {
    renderWithFeatureMessages(<ProviderCardMeta provider={provider} />, {
      locale: "pl",
      messages: polishIntegrationsMessages,
    });

    expect(screen.getByText("Ostatnie sprawdzenie pozycji")).toBeVisible();
    expect(screen.queryByText("Last rank check")).not.toBeInTheDocument();
    // Ninety days is months, not "2133h ago", and the words come from the locale.
    expect(screen.getByText("3 miesiące temu")).toBeVisible();
  });

  it("keeps a never-used connection on a catalog value", () => {
    renderWithFeatureMessages(
      <ProviderCardMeta
        provider={{ ...provider, meta: [{ labelKey: "lastSync", valueKey: "never" }] }}
      />,
      { locale: "pl", messages: polishIntegrationsMessages },
    );

    expect(screen.getByText("Nigdy")).toBeVisible();
    expect(screen.queryByText("Never")).not.toBeInTheDocument();
  });
});
