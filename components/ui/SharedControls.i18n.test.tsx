import {
  renderWithFeatureMessages,
  renderWithSharedMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { act, fireEvent, screen } from "@testing-library/react";
import { useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { ConfirmModal } from "./ConfirmModal";
import { CopyButton } from "./CopyButton";
import { DataTable } from "./data-table/DataTable";
import { DataTableColumnsMenu } from "./data-table/DataTableColumnsMenu";
import { DataTableDensityMenu } from "./data-table/DataTableDensityMenu";
import type { DataTableColumn } from "./data-table/data-table-types";
import { PasswordInput } from "./PasswordInput";
import { StatusPill } from "./StatusPill";

const mocks = vi.hoisted(() => ({ showToast: vi.fn(), writeText: vi.fn() }));

vi.mock("./toast-context", () => ({ useToast: () => ({ showToast: mocks.showToast }) }));

const polishSharedMessages = {
  shared: {
    controls: {
      alert: { dismiss: "Zamknij alert" },
      button: { loading: "Ładowanie" },
      confirmation: {
        cancel: "Anuluj",
        failure: "Nie udało się wykonać działania. Spróbuj ponownie.",
        typeToConfirm: "Wpisz <strong>{word}</strong>, aby potwierdzić",
        working: "Trwa wykonywanie...",
        deleteKeywordBody:
          "Przestań śledzić to słowo kluczowe i usuń jego historię pozycji. Tej operacji nie można cofnąć.",
        deleteKeywordDangerLabel: "Usuń słowo kluczowe",
        deleteKeywordToastMessage: "Usunięto słowo kluczowe",
        deleteKeywordTitle: "Usuń słowo kluczowe",
      },
      copy: {
        action: "Kopiuj",
        copied: "Skopiowano!",
        failed: "Kopiowanie nie powiodło się",
        id: "Kopiuj identyfikator",
      },
      dataTable: {
        clearSort: "Wyczyść sortowanie kolumny {column}",
        columns: "Kolumny",
        column: "Kolumna",
        compact: "Zwarte",
        comfortable: "Wygodne",
        density: "Gęstość tabeli",
        hideColumn: "Ukryj kolumnę {column}",
        nextPage: "Następna strona",
        number: "{value, number}",
        pageAnnouncement: "Strona {page, number} z {pageCount, number}",
        pageRange: "{start, number}-{end, number} z {total, number}",
        previousPage: "Poprzednia strona",
        resizeColumn: "Zmień szerokość kolumny {column}",
        resizeInstructions:
          "Przeciągnij, aby zmienić szerokość. Kliknij dwukrotnie, aby zresetować.",
        resetLayout: "Resetuj układ",
        rows: "Wiersze",
        rowsPerPage: "Wiersze na stronę",
        selectRow: "Zaznacz {row}",
        selectVisibleRows: "Zaznacz widoczne wiersze",
        collapseRow: "Zwiń {row}",
        expandRow: "Rozwiń {row}",
        selectedRows:
          "{count, plural, =0 {Nie zaznaczono wierszy} one {Zaznaczono # wiersz} few {Zaznaczono # wiersze} many {Zaznaczono # wierszy} other {Zaznaczono # wiersza}}",
        showColumn: "Pokaż kolumnę {column}",
        sortAscending: "Sortuj kolumnę {column} rosnąco",
        sortDescending: "Sortuj kolumnę {column} malejąco",
        standard: "Standardowe",
        toggleColumns: "Przełącz kolumny",
      },
      drawer: { close: "Zamknij panel" },
      modal: { close: "Zamknij okno" },
      password: { hide: "Ukryj hasło", show: "Pokaż hasło" },
      sheet: { close: "Zamknij arkusz" },
      status: { fallback: "Status", primary: "Główne" },
    },
  },
};

function renderWithPolishMessages(element: ReactElement) {
  return renderWithFeatureMessages(element, { locale: "pl", messages: polishSharedMessages });
}

function AuthCodeProbe() {
  const t = useTranslations("auth.otp");
  return <span>{t("code")}</span>;
}

describe("shared control translations", () => {
  it("keeps caller content and its accessible name while loading without a label", () => {
    renderWithPolishMessages(
      <Button loading>
        <span>Save project</span>
      </Button>,
    );

    expect(screen.getByRole("button", { name: "Save project" })).toHaveTextContent("Save project");
    expect(screen.queryByText("Ładowanie")).not.toBeInTheDocument();
  });

  it("keeps caller wrappers and rerender behavior with the shared-only renderer", () => {
    const view = renderWithSharedMessages(<StatusPill status="connected" />, {
      wrapper: ({ children }) => <div data-testid="caller-wrapper">{children}</div>,
    });

    expect(screen.getByTestId("caller-wrapper")).toContainElement(screen.getByText("Connected"));
    view.rerender(<StatusPill status="ready" />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("allows a non-English feature payload to replace shared test messages", () => {
    renderWithPolishMessages(<StatusPill status="primary" />);

    expect(screen.getByText("Główne")).toBeInTheDocument();
    expect(screen.queryByText("Primary")).not.toBeInTheDocument();
  });

  it("does not manufacture feature keys absent from the explicit payload", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    try {
      renderWithFeatureMessages(<AuthCodeProbe />, {
        locale: "pl",
        messages: polishSharedMessages,
      });

      expect(screen.getByText("auth.otp.code")).toBeInTheDocument();
      expect(screen.queryByText("Code")).not.toBeInTheDocument();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("uses test-only Polish messages for copy state, undo toast, and failure feedback", async () => {
    mocks.showToast.mockReset();
    mocks.writeText.mockRejectedValueOnce(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: mocks.writeText },
    });

    const copyView = renderWithPolishMessages(<CopyButton text="keyword" />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Kopiuj" }));
    });
    expect(screen.getByRole("button", { name: "Kopiowanie nie powiodło się" })).toBeVisible();
    expect(mocks.showToast).toHaveBeenCalledWith(
      "Kopiowanie nie powiodło się",
      expect.objectContaining({ severity: "error" }),
    );

    copyView.unmount();
    renderWithPolishMessages(
      <ConfirmModal
        kind="deleteKeyword"
        onClose={vi.fn()}
        onConfirm={async () => undefined}
        onUndo={vi.fn()}
        open
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Usuń słowo kluczowe" }));
    });
    expect(mocks.showToast).toHaveBeenCalledWith(
      "Usunięto słowo kluczowe",
      expect.objectContaining({ undo: expect.any(Function) }),
    );
  });

  it("uses test-only Polish messages for password and table accessibility controls", () => {
    type Row = { id: string; name: string };
    const columns: readonly DataTableColumn<Row>[] = [
      { accessorKey: "name", header: "Nazwa", size: 140 },
    ];

    renderWithPolishMessages(
      <>
        <PasswordInput aria-label="Hasło API" />
        <DataTable
          ariaLabel="Wyniki"
          columns={columns}
          id="polish-table"
          onSelectionChange={vi.fn()}
          onSortingChange={vi.fn()}
          pagination={{ page: 2, pageSize: 1, pageSizeOptions: [1], rowCount: 3 }}
          rows={[{ id: "one", name: "Pierwszy" }]}
          selectable={() => true}
          selection={new Set()}
          sorting={null}
        />
        <DataTableColumnsMenu columns={columns} id="polish-table-controls" />
        <DataTableDensityMenu density="standard" onDensityChange={vi.fn()} />
      </>,
    );

    expect(screen.getByRole("button", { name: "Pokaż hasło" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Poprzednia strona" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Następna strona" })).toBeVisible();
    expect(screen.getByRole("checkbox", { name: "Zaznacz widoczne wiersze" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Sortuj kolumnę Nazwa rosnąco" })).toBeVisible();
    expect(
      screen.getByRole("separator", { name: "Zmień szerokość kolumny Nazwa" }),
    ).toHaveAttribute(
      "title",
      "Przeciągnij, aby zmienić szerokość. Kliknij dwukrotnie, aby zresetować.",
    );
    expect(screen.getByRole("button", { name: "Kolumny" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Gęstość tabeli" })).toBeVisible();
  });
});
