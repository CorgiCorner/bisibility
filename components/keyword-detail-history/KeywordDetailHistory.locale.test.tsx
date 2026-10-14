import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { renderWithFeatureMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import enDetail from "@/messages/core/en/project-rank-tracker-keyword-detail.json";
import enShared from "@/messages/core/en/shared.json";
import esDetail from "@/messages/core/es-ES/project-rank-tracker-keyword-detail.json";
import esShared from "@/messages/core/es-ES/shared.json";
import jaDetail from "@/messages/core/ja/project-rank-tracker-keyword-detail.json";
import jaShared from "@/messages/core/ja/shared.json";
import plDetail from "@/messages/core/pl/project-rank-tracker-keyword-detail.json";
import plShared from "@/messages/core/pl/shared.json";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { snapshot } from "./history.test-fixture";
import { RetainedSnapshotCard } from "./RetainedSnapshotCard";

const locales = [
  {
    locale: "en" as const,
    messages: mergeMessageCatalogs(enDetail, enShared),
    expiry: "Raw detail expired; normalized observations remain available.",
    unknown: "Feature presence unavailable",
  },
  {
    locale: "es-ES" as const,
    messages: mergeMessageCatalogs(esDetail, esShared),
    expiry: "El detalle ha caducado; las observaciones normalizadas siguen disponibles.",
    unknown: "Presencia de funciones no disponible",
  },
  {
    locale: "ja" as const,
    messages: mergeMessageCatalogs(jaDetail, jaShared),
    expiry: "詳細データは期限切れですが、正規化された観測は利用できます。",
    unknown: "機能の存在は不明",
  },
  {
    locale: "pl" as const,
    messages: mergeMessageCatalogs(plDetail, plShared),
    expiry: "Szczegółowy zapis wygasł; znormalizowane obserwacje pozostają dostępne.",
    unknown: "Obecność funkcji niedostępna",
  },
];

describe("recorded history locale integration", () => {
  it.each(locales)(
    "preserves rank and unknown feature presence using real $locale catalogs",
    ({ locale, messages, expiry, unknown }) => {
      render(<RetainedSnapshotCard snapshot={snapshot()} timeZone="UTC" />, { locale, messages });
      expect(screen.getByText("#6")).toBeInTheDocument();
      expect(screen.getByText(expiry)).toBeInTheDocument();
      expect(screen.getByText(unknown)).toBeInTheDocument();
      expect(screen.queryByText(/recordedHistory\./)).not.toBeInTheDocument();
    },
  );
});
