import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { renderWithFeatureMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { presentReportSummary } from "@/lib/rank-reports/presentation";
import enImport from "@/messages/core/en/project-rank-tracker-keyword-import.json";
import enShared from "@/messages/core/en/shared.json";
import esImport from "@/messages/core/es-ES/project-rank-tracker-keyword-import.json";
import esShared from "@/messages/core/es-ES/shared.json";
import jaImport from "@/messages/core/ja/project-rank-tracker-keyword-import.json";
import jaShared from "@/messages/core/ja/shared.json";
import plImport from "@/messages/core/pl/project-rank-tracker-keyword-import.json";
import plShared from "@/messages/core/pl/shared.json";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KeywordRankValue } from "./KeywordRankValue";
import { KeywordReportSummary } from "./KeywordReportSummary";
import { currentScopeUnavailableRow, wholeScopeReport } from "./keyword-rank-quality.test-fixture";

const locales = [
  {
    locale: "en" as const,
    directions: "1 improved; 1 declined",
    messages: mergeMessageCatalogs(enImport, enShared),
    unknown: "Current position unknown",
    scope: "Current tracking settings unavailable",
  },
  {
    locale: "es-ES" as const,
    directions: "1 mejoraron; 1 empeoraron",
    messages: mergeMessageCatalogs(esImport, esShared),
    unknown: "Posición actual desconocida",
    scope: "La configuración de seguimiento actual no está disponible",
  },
  {
    locale: "ja" as const,
    directions: "順位上昇 1 件; 順位低下 1 件",
    messages: mergeMessageCatalogs(jaImport, jaShared),
    unknown: "現在の順位は不明",
    scope: "現在のトラッキング設定を取得できません",
  },
  {
    locale: "pl" as const,
    directions: "1 poprawiło pozycję; 1 pogorszyło pozycję",
    messages: mergeMessageCatalogs(plImport, plShared),
    unknown: "Bieżąca pozycja nieznana",
    scope: "Bieżące ustawienia monitorowania są niedostępne",
  },
];

describe("rank quality catalog integration", () => {
  it.each(locales)(
    "uses the real $locale catalogs for unknown current scope and whole-scope help",
    ({ locale, messages, unknown, scope, directions }) => {
      render(
        <>
          <KeywordRankValue row={currentScopeUnavailableRow()} />
          <KeywordReportSummary report={presentReportSummary(wholeScopeReport())} expected={1} />
        </>,
        { locale, messages },
      );
      expect(screen.getByText(unknown)).toBeInTheDocument();
      expect(screen.getByText(scope)).toBeInTheDocument();
      expect(screen.getByText(directions)).toBeInTheDocument();
      expect(screen.getByTestId("keyword-full-scope-report")).toBeInTheDocument();
      expect(screen.queryByText(/grid\.quality\./)).not.toBeInTheDocument();
      expect(screen.queryByText("#101")).not.toBeInTheDocument();
    },
  );
});
