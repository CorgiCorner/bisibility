import { CountrySelect } from "@/components/locations/CountrySelect";
import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { Calendar } from "./Calendar";
import { CheckStatusChip } from "./CheckStatusChip";
import { ExpiryChoiceGroup } from "./ExpiryChoiceGroup";
import { MenuMultiSelect, MenuSelect } from "./MenuSelect";
import { StatusChip } from "./StatusChip";
import { runStatusChipPresentation } from "./status-chip-mapping";
import { TagAdder } from "./TagAdder";
import { ThemeSegments } from "./ThemeSegments";
import { ToastProvider } from "./Toast";
import { type ToastEntry, ToastItem } from "./ToastItem";
import { ToolbarSearch } from "./ToolbarSearch";
import { useToast } from "./toast-context";

const polishSharedMessages = {
  shared: {
    controls: {
      calendar: {
        april: "Kwiecień",
        august: "Sierpień",
        chooseDate: "Wybierz datę",
        december: "Grudzień",
        february: "Luty",
        friday: "Pt",
        january: "Styczeń",
        july: "Lipiec",
        june: "Czerwiec",
        march: "Marzec",
        may: "Maj",
        monday: "Pn",
        monthYear: "{month} {year}",
        nextMonth: "Następny miesiąc",
        november: "Listopad",
        october: "Październik",
        previousMonth: "Poprzedni miesiąc",
        saturday: "So",
        september: "Wrzesień",
        sunday: "Nd",
        thursday: "Cz",
        tuesday: "Wt",
        wednesday: "Śr",
      },
      checkStatus: {
        completed: "Ukończono",
        failed: "Niepowodzenie",
        pending: "Oczekuje",
        running: "W toku",
      },
      countrySelect: {
        catalog: "Wszystkie kraje",
        noResults: "Nie znaleziono kraju pasującego do wyszukiwania.",
        searchPlaceholder: "Szukaj krajów",
        tracked: "Śledzone kraje",
      },
      expiryChoice: { label: "Wygasa" },
      menuMultiSelect: {
        noResults: "Brak wyników",
        searchPlaceholder: "Szukaj...",
        selected:
          "{count, plural, one {# wybrany} few {# wybrane} many {# wybranych} other {# wybranego}}",
      },
      menuSelect: {
        moreOptionsHint: "Więcej opcji. Wpisz, aby wyszukać.",
        noResults: "Brak wyników",
        searchPlaceholder: "Szukaj...",
      },
      status: { running: "Uruchomiono" },
      tagAdder: {
        action: "Dodaj tag",
        cancel: "Anuluj dodawanie tagu",
        enter: "Enter",
        input: "Nazwa nowego tagu",
      },
      theme: { dark: "Ciemny", label: "Motyw", light: "Jasny", system: "Systemowy" },
      toast: { undo: "Cofnij", undoFailed: "Cofnięcie nie powiodło się. Spróbuj ponownie." },
      toolbarSearch: { clear: "Wyczyść {label}" },
    },
  },
};

const toast: ToastEntry = {
  durationMs: 6_000,
  id: 1,
  message: "Dodano rynek",
  phase: "visible",
  severity: "success",
  undo: vi.fn(),
  undoPending: false,
};

function renderPolish(ui: ReactElement) {
  return renderWithFeatureMessages(ui, { locale: "pl", messages: polishSharedMessages });
}

function RejectedUndoToast() {
  const { showToast } = useToast();
  return (
    <button
      onClick={() =>
        showToast("Dodano rynek", {
          undo: () => Promise.reject(new Error("denied")),
        })
      }
      type="button"
    >
      Pokaż cofanie
    </button>
  );
}

describe("remaining shared control translations", () => {
  it("uses injected defaults while preserving country codes and explicit caller copy", async () => {
    const user = userEvent.setup();
    const onCountryChange = vi.fn();
    renderPolish(
      <>
        <MenuSelect
          ariaLabel="Filtr"
          groups={[
            { id: "visible", label: "Widoczne", options: [{ label: "Jeden", value: "one" }] },
            {
              id: "hidden",
              label: "Ukryte",
              options: [{ label: "Dwa", value: "two" }],
              searchOnly: true,
            },
          ]}
          onChange={vi.fn()}
          searchable
          value="one"
        />
        <MenuMultiSelect
          ariaLabel="Rynki"
          onChange={vi.fn()}
          options={[
            { label: "Polska", value: "PL" },
            { label: "Niemcy", value: "DE" },
            { label: "Hiszpania", value: "ES" },
          ]}
          searchable
          values={["PL", "DE", "ES"]}
        />
        <CountrySelect
          ariaLabel="Kraj"
          countries={[
            { code: "PL", label: "Poland" },
            { code: "US", label: "United States" },
          ]}
          onChange={onCountryChange}
          trackedCodes={["US"]}
          value="US"
        />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Filtr" }));
    expect(screen.getByRole("textbox", { name: "Szukaj..." })).toHaveAccessibleDescription(
      "Więcej opcji. Wpisz, aby wyszukać.",
    );
    await user.type(screen.getByRole("textbox", { name: "Szukaj..." }), "brak");
    expect(screen.getByText("Brak wyników")).toBeVisible();
    await user.keyboard("{Escape}");

    expect(screen.getByRole("button", { name: "Rynki" })).toHaveTextContent("3 wybrane");
    await user.click(screen.getByRole("button", { name: "Rynki" }));
    await user.type(screen.getByRole("textbox", { name: "Szukaj..." }), "nie ma");
    expect(screen.getByText("Brak wyników")).toBeVisible();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Kraj" }));
    expect(screen.getByText("Śledzone kraje")).toBeVisible();
    expect(screen.getByText("Wszystkie kraje")).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Stany Zjednoczone" })).toBeVisible();
    expect(screen.getByRole("menuitem", { name: "Polska" })).toBeVisible();
    await user.click(screen.getByRole("menuitem", { name: "Polska" }));
    expect(onCountryChange).toHaveBeenCalledWith("PL");
  });

  it("translates generic actions and labels without changing their callbacks", async () => {
    const user = userEvent.setup();
    const onUndoClick = vi.fn();
    const onExpiryChange = vi.fn();
    const onTagAdd = vi.fn();
    const onSearchChange = vi.fn();
    renderPolish(
      <>
        <ToastItem
          onEntered={vi.fn()}
          onExited={vi.fn()}
          onPauseFocus={vi.fn()}
          onPauseHover={vi.fn()}
          onResumeFocus={vi.fn()}
          onResumeHover={vi.fn()}
          onUndoClick={onUndoClick}
          reducedMotion
          toast={toast}
        />
        <TagAdder onAdd={onTagAdd} />
        <ExpiryChoiceGroup
          onChange={onExpiryChange}
          options={[
            { days: 30, label: "30 dni" },
            { days: null, label: "Bez daty" },
          ]}
          value={30}
        />
        <CheckStatusChip kind="running" />
        <StatusChip {...runStatusChipPresentation("running")} />
        <ThemeSegments defaultPreference="light" />
        <ToolbarSearch
          id="shared-search"
          label="Wyszukaj wpisy"
          onChange={onSearchChange}
          placeholder="Szukaj wpisów"
          value="test"
        />
        <Calendar onChange={vi.fn()} value="2026-07-20" />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Cofnij" }));
    expect(onUndoClick).toHaveBeenCalledWith(1);

    await user.click(screen.getByRole("button", { name: "Dodaj tag" }));
    await user.type(screen.getByRole("textbox", { name: "Nazwa nowego tagu" }), "docs{Enter}");
    expect(onTagAdd).toHaveBeenCalledWith("docs");

    fireEvent.click(screen.getByRole("radio", { name: "Bez daty" }));
    expect(onExpiryChange).toHaveBeenCalledWith(null);
    expect(screen.getByRole("group", { name: "Wygasa" })).toBeVisible();
    expect(screen.getByText("W toku")).toBeVisible();
    expect(screen.getByText("Uruchomiono")).toBeVisible();
    expect(screen.getByRole("radio", { name: "Ciemny" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Wyczyść Wyszukaj wpisy" }));
    expect(onSearchChange).toHaveBeenCalledWith("");
    expect(screen.getByText("Lipiec 2026")).toBeVisible();
    expect(screen.getByRole("button", { name: "Poprzedni miesiąc" })).toBeVisible();
  });

  it("uses the injected undo failure copy on the ToastProvider error path", async () => {
    const user = userEvent.setup();
    renderPolish(
      <ToastProvider>
        <RejectedUndoToast />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Pokaż cofanie" }));
    await user.click(screen.getByRole("button", { name: "Cofnij" }));

    const failure = await screen.findByText("Cofnięcie nie powiodło się. Spróbuj ponownie.");
    expect(failure.closest("output")).toHaveAttribute("data-toast-severity", "error");
    expect(screen.queryByRole("button", { name: "Cofnij" })).not.toBeInTheDocument();
  });
});
