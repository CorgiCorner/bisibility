import { mergeMessageCatalogs } from "@/i18n/catalog-contract";
import { featureMessagesElement } from "@/i18n/test-support/render-with-feature-messages";
import en from "@/messages/core/en/project-settings-usage.json";
import sharedEn from "@/messages/core/en/shared.json";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UsageDisplayControls } from "./UsageDisplayControls";
import { useUsageDisplaySettings } from "./use-usage-display-settings";
import { useUsagePresentation } from "./use-usage-presentation";

const storageKey = "bisibility:usage-display:v1";

function Amount({ label }: { label: string }) {
  const p = useUsagePresentation();
  return (
    <output aria-label={label}>
      {p.figure({ text: "7.4071", unit: "cents", certainty: "measured" })}
      {p.unit("cents")}
    </output>
  );
}

function renderControls() {
  return render(
    featureMessagesElement(
      <>
        <UsageDisplayControls />
        <Amount label="Header" />
        <Amount label="Usage" />
      </>,
      { locale: "en", messages: mergeMessageCatalogs(sharedEn, en) },
    ),
  );
}

beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent("storage", { key: null }));
});

afterEach(() => vi.restoreAllMocks());

it("changes both surfaces, saves display settings and restores them after remount", () => {
  const view = renderControls();
  expect(screen.getByLabelText("Header")).toHaveTextContent("$0.07");
  expect(screen.getByLabelText("Usage")).toHaveTextContent("$0.07");
  fireEvent.click(screen.getByRole("button", { name: "Decimal places" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "4" }));
  expect(screen.getByLabelText("Usage")).toHaveTextContent("$0.0741");
  fireEvent.click(screen.getByRole("button", { name: "Amounts" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Cents" }));
  expect(screen.getByLabelText("Header")).toHaveTextContent("7.4071cents");
  expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}")).toMatchObject({
    moneyDisplay: "raw-unit",
    moneyFractionDigits: 4,
    quantityFractionDigits: 4,
  });
  view.unmount();
  renderControls();
  expect(screen.getByLabelText("Usage")).toHaveTextContent("7.4071cents");
});

it("uses defaults for corrupt preferences and responds to another tab clearing them", () => {
  localStorage.setItem(storageKey, '{"moneyDisplay":"invalid","moneyFractionDigits":99}');
  renderControls();
  expect(screen.getByLabelText("Usage")).toHaveTextContent("$0.07");
  act(() => {
    localStorage.setItem(storageKey, '{"moneyDisplay":"raw-unit","moneyFractionDigits":2}');
    window.dispatchEvent(new StorageEvent("storage", { key: storageKey }));
  });
  expect(screen.getByLabelText("Usage")).toHaveTextContent("7.41cents");
  act(() => {
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
  });
  expect(screen.getByLabelText("Usage")).toHaveTextContent("$0.07");
});

it("applies changes even when browser storage refuses writes", () => {
  function StorageUnavailable() {
    const { setOptions } = useUsageDisplaySettings();
    return (
      <button type="button" onClick={() => setOptions({ moneyFractionDigits: 4 })}>
        Set precision
      </button>
    );
  }
  renderControls();
  render(<StorageUnavailable />);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage full");
  });
  fireEvent.click(screen.getByRole("button", { name: "Set precision" }));
  expect(screen.getByLabelText("Usage")).toHaveTextContent("$0.0741");
});
