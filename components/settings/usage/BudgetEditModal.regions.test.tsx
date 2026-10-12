import { providerUiRows } from "@/components/provider-management/provider-ui-fixtures";
import {
  connections,
  surfaceLabel,
} from "@/components/settings/usage/__tests__/BudgetEditModal.fixtures";
import { setRows } from "@/components/settings/usage/__tests__/BudgetEditModal.render";
import { BudgetEditModal } from "@/components/settings/usage/BudgetEditModal";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import enIntegrations from "@/messages/core/en/project-integrations.json";
import enUsage from "@/messages/core/en/project-settings-usage.json";
import enShared from "@/messages/core/en/shared.json";
import esIntegrations from "@/messages/core/es-ES/project-integrations.json";
import esUsage from "@/messages/core/es-ES/project-settings-usage.json";
import esShared from "@/messages/core/es-ES/shared.json";
import jaIntegrations from "@/messages/core/ja/project-integrations.json";
import jaUsage from "@/messages/core/ja/project-settings-usage.json";
import jaShared from "@/messages/core/ja/shared.json";
import plIntegrations from "@/messages/core/pl/project-integrations.json";
import plUsage from "@/messages/core/pl/project-settings-usage.json";
import plShared from "@/messages/core/pl/shared.json";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const locales = [
  { locale: "en", messages: { ...enShared, ...enUsage, ...enIntegrations } },
  { locale: "pl", messages: { ...plShared, ...plUsage, ...plIntegrations } },
  { locale: "es-ES", messages: { ...esShared, ...esUsage, ...esIntegrations } },
  { locale: "ja", messages: { ...jaShared, ...jaUsage, ...jaIntegrations } },
] as const;

describe.each(locales)("allocation region names in $locale", ({ locale, messages }) => {
  it.each([
    { fundingSource: "byok", surface: "app", field: "appBudgetField" },
    { fundingSource: "byok", surface: "programmatic", field: "programmaticBudgetField" },
    { fundingSource: "platform", surface: "app", field: "creditsAppBudgetField" },
    { fundingSource: "platform", surface: "programmatic", field: "creditsProgrammaticBudgetField" },
  ] as const)(
    "distinguishes two connections for $fundingSource $surface",
    async ({ fundingSource, surface, field }) => {
      const rows = providerUiRows(connections, true)
        .filter((row) => row.fundingSource === fundingSource && row.surface === surface)
        .map((row, index) => ({ ...row, label: `Search connection ${index + 1}` }));
      setRows(rows);
      renderWithFeatureMessages(
        <BudgetEditModal
          connections={connections}
          onClose={vi.fn()}
          onSaved={vi.fn()}
          projectId="prj_regions"
          projectRef="prj_regions"
        />,
        { locale, messages },
      );
      const copy = messages.projectSettingsUsage.provider.budgetDialog;
      await screen.findByLabelText(surfaceLabel(copy[field], connections[0].provider));
      const regions = screen.getAllByRole("region");
      expect(regions).toHaveLength(2);
      expect(new Set(regions.map((region) => region.getAttribute("aria-label"))).size).toBe(2);
      const source = fundingSource === "byok" ? copy.sourceOwn : copy.sourceCredits;
      const surfaceName = surface === "app" ? copy.appBudget : copy.programmaticBudget;
      for (const row of rows) {
        const name =
          locale === "ja"
            ? `${row.label}：${source}・${surfaceName}`
            : `${row.label}: ${source}, ${surfaceName}`;
        expect(screen.getByRole("region", { name })).toBeVisible();
      }
    },
  );
});
