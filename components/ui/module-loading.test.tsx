import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

const loads = vi.hoisted(() => ({
  drawer: vi.fn(),
  icons: vi.fn(),
  menu: vi.fn(),
  table: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@phosphor-icons/react", async (importOriginal) => {
  loads.icons();
  return importOriginal();
});

vi.mock("./AppDrawer", () => {
  loads.drawer();
  return { AppDrawer: () => null };
});
vi.mock("./MenuSelect", () => {
  loads.menu();
  return { MenuSelect: () => null, MenuMultiSelect: () => null };
});
vi.mock("./data-table/DataTable", () => {
  loads.table();
  return { DataTable: () => null };
});
vi.mock("./ToastItem", () => {
  loads.toast();
  return { ToastItem: () => null };
});

it("loads form helpers and settings cards without unrelated tables, overlays, or toast views", async () => {
  const { keywordLines } = await import("@/components/onboarding/onboarding-form-utils");
  const { SettingsCard } = await import("@/components/settings/shell/SettingsCard");
  expect(keywordLines("alpha\n\n beta ")).toEqual(["alpha", "beta"]);
  render(<SettingsCard title="Preferences">Settings content</SettingsCard>);
  expect(screen.getByRole("heading", { name: "Preferences" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  for (const load of Object.values(loads)) expect(load).not.toHaveBeenCalled();
});

it("lets hooks access toast context without initializing toast presentation", async () => {
  const { useToast } = await import("./toast-context");
  function Consumer() {
    const { showToast } = useToast();
    return (
      <button type="button" onClick={() => showToast("Saved", { severity: "success" })}>
        Notify
      </button>
    );
  }
  render(<Consumer />);
  expect(screen.getByRole("button", { name: "Notify" })).toBeInTheDocument();
  expect(loads.toast).not.toHaveBeenCalled();
});

it("renders a copy control without initializing the icon catalog", async () => {
  const { CopyButton } = await import("./CopyButton");
  render(<CopyButton label="Copy identifier" text="example" />);
  expect(
    screen.getByRole("button", { name: "Copy identifier" }).querySelector("svg"),
  ).not.toBeNull();
  expect(loads.icons).not.toHaveBeenCalled();
});
