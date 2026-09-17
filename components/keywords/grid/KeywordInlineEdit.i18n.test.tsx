import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import type { KeywordRow } from "@/lib/queries/keywords";
import projectRankTrackerKeywordImportMessages from "@/messages/core/en/project-rank-tracker-keyword-import.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KeywordInlineEdit } from "./KeywordInlineEdit";

const grid =
  projectRankTrackerKeywordImportMessages.projectRankTracker.keywordImport.management.grid;

const polishMessages = mergeMessageCatalogs({
  projectRankTracker: {
    keywordImport: {
      ...projectRankTrackerKeywordImportMessages.projectRankTracker.keywordImport,
      management: {
        ...projectRankTrackerKeywordImportMessages.projectRankTracker.keywordImport.management,
        grid: {
          ...grid,
          deviceDesktop: "Komputer",
          deviceMobile: "Komorka",
          inlineDeviceHelp: "Wyniki na komputerze i telefonie moga sie roznic.",
          inlineIntentHelp: "Kategoria intencji wyszukiwania do filtrowania.",
          inlineKeyword: "Fraza",
          inlineKeywordHelp: "Dokladna fraza sledzona w wynikach.",
          inlineLocationDegraded: "Lokalizacja zostala ustawiona na poziomie kraju.",
          inlineLocationHelp: "Kraj lub miasto okresla lokalizacje wynikow.",
          inlineSave: "Zapisz",
          inlineSaveFailed: "Nie mozna zapisac frazy. Sprobuj ponownie.",
          inlineTags: "Etykiety",
          inlineTagsHelp: "Etykiety rozdzielone przecinkami do filtrowania.",
          inlineTargetUrl: "Adres docelowy",
          inlineTargetUrlHelp: "Strona, ktora ma pojawic sie w wynikach.",
          inlineTopicHelp: "Dowolna grupa do filtrowania i raportowania.",
          inlineValidationIntent: "Podaj intencje do 80 znakow.",
          inlineValidationKeyword: "Podaj fraze do 180 znakow.",
          inlineValidationLocation: "Wybierz obslugiwana lokalizacje.",
          inlineValidationTags: "Podaj do 12 poprawnych etykiet.",
          inlineValidationTargetUrl: "Podaj bezwzgledny adres URL albo sciezke.",
          inlineValidationTopic: "Podaj temat do 80 znakow.",
          locationLabel: "Lokalizacja",
        },
      },
    },
  },
  shared: {
    ...sharedMessages.shared,
    errors: {
      ...sharedMessages.shared.errors,
      genericFallback: "Nie mozna wykonac akcji.",
      serverComponentDigest: "Sprawdzenie nie powiodlo sie (numer {digest}). Sprobuj ponownie.",
      staleDeployment: "Aplikacja zostala zaktualizowana. Odswiez strone i sprobuj ponownie.",
    },
  },
});

function keyword(overrides: Partial<KeywordRow> = {}): KeywordRow {
  return { ...keywordRows[0], ...overrides };
}

function renderEditor(overrides: Partial<React.ComponentProps<typeof KeywordInlineEdit>> = {}) {
  return renderWithFeatureMessages(
    <KeywordInlineEdit
      keyword={keyword()}
      onSaved={vi.fn()}
      updateKeywordAction={vi.fn()}
      {...overrides}
    />,
    { locale: "pl", messages: polishMessages },
  );
}

describe("KeywordInlineEdit localized consumer contract", () => {
  it("opens translated field-help tooltips and renders the translated Target URL control", async () => {
    const user = userEvent.setup();
    renderEditor();

    const keywordHelp = screen.getByRole("button", { name: "Dokladna fraza sledzona w wynikach." });
    await user.hover(keywordHelp);

    await waitFor(() =>
      expect(document.querySelector("[data-ui-tooltip]")).toHaveTextContent(
        "Dokladna fraza sledzona w wynikach.",
      ),
    );
    const locationHelp = screen.getByRole("button", {
      name: "Kraj lub miasto okresla lokalizacje wynikow.",
    });
    await user.hover(locationHelp);
    await waitFor(() =>
      expect(document.querySelector("[data-ui-tooltip]")).toHaveTextContent(
        "Kraj lub miasto okresla lokalizacje wynikow.",
      ),
    );
    expect(screen.getByLabelText("Adres docelowy")).toBeInTheDocument();
    const targetHelp = screen.getByRole("button", {
      name: "Strona, ktora ma pojawic sie w wynikach.",
    });
    await user.hover(targetHelp);
    await waitFor(() =>
      expect(document.querySelector("[data-ui-tooltip]")).toHaveTextContent(
        "Strona, ktora ma pojawic sie w wynikach.",
      ),
    );
  });

  it("projects keyword, URL, and tag schema failures through translated field messages", async () => {
    const updateKeywordAction = vi.fn();
    renderEditor({ updateKeywordAction });

    fireEvent.change(screen.getByLabelText("Fraza"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Adres docelowy"), {
      target: { value: "not a URL" },
    });
    fireEvent.change(screen.getByLabelText("Etykiety"), {
      target: { value: Array.from({ length: 13 }, (_, index) => `etykieta-${index}`).join(", ") },
    });
    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));

    expect(await screen.findByText("Podaj fraze do 180 znakow.")).toBeInTheDocument();
    expect(screen.getByText("Podaj bezwzgledny adres URL albo sciezke.")).toBeInTheDocument();
    expect(screen.getByText("Podaj do 12 poprawnych etykiet.")).toBeInTheDocument();
    expect(updateKeywordAction).not.toHaveBeenCalled();
  });

  it("localizes the stored device label while identity fields are locked", () => {
    renderEditor({ keyword: keyword({ device: "Mobile" }), layout: "drawer", lockIdentity: true });

    expect(document.querySelector("p")?.textContent).toContain("Komorka");
    expect(screen.queryByText("Mobile")).not.toBeInTheDocument();
  });

  it("uses localized stale-deployment recovery and does not disclose unknown action errors", async () => {
    const staleError = new Error("This request might be from an older or newer deployment.");
    const { unmount } = renderEditor({
      updateKeywordAction: vi.fn().mockRejectedValue(staleError),
    });

    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    expect(
      await screen.findByText(
        "Aplikacja zostala zaktualizowana. Odswiez strone i sprobuj ponownie.",
      ),
    ).toBeInTheDocument();

    unmount();
    renderEditor({
      updateKeywordAction: vi.fn().mockRejectedValue(new Error("upstream detail")),
    });
    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));

    expect(
      await screen.findByText("Nie mozna zapisac frazy. Sprobuj ponownie."),
    ).toBeInTheDocument();
    expect(screen.queryByText("upstream detail")).not.toBeInTheDocument();
  });

  it("keeps digest recovery and degraded-location feedback inside the localized consumer", async () => {
    const digestError = Object.assign(new Error("Server Components render failed."), {
      digest: "abc123",
    });
    const { unmount } = renderEditor({
      updateKeywordAction: vi.fn().mockRejectedValue(digestError),
    });

    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));
    expect(
      await screen.findByText("Sprawdzenie nie powiodlo sie (numer abc123). Sprobuj ponownie."),
    ).toBeInTheDocument();

    unmount();
    renderEditor({
      updateKeywordAction: vi.fn().mockResolvedValue({ warning: "raw server prose" }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Zapisz" }));

    expect(
      await screen.findByText("Lokalizacja zostala ustawiona na poziomie kraju."),
    ).toBeInTheDocument();
    expect(screen.queryByText("raw server prose")).not.toBeInTheDocument();
  });
});
