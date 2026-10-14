import { sharedMessages as messages } from "@/i18n/core-messages";
import type { SaveMonitor } from "@/lib/local-monitors/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { MonitorForm } from "./MonitorForm";
import { monitorChoiceFixture, monitorUiFixture } from "./monitor-ui.test-fixture";

function renderEditor(save: SaveMonitor, legacy = false) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MonitorForm
        projectId="prj_abcdefghijklmnopqrstuvwx"
        current={
          legacy
            ? {
                ...monitorUiFixture,
                axes: { ...monitorUiFixture.axes, operatingSystem: null, zoom: null },
              }
            : monitorUiFixture
        }
        choices={{
          ...monitorChoiceFixture,
          keywords: [
            ...monitorChoiceFixture.keywords,
            { id: "kw_bbcdefghijklmnopqrstuvwx", text: "Synthetic mobile", device: "mobile" },
          ],
        }}
        save={save}
        search={vi.fn()}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
}
describe("editable supported monitor request dimensions", () => {
  it("keeps legacy nulls visible but requires explicit OS and zoom to save a new Maps revision", async () => {
    const save = vi.fn<SaveMonitor>().mockResolvedValue({ kind: "unavailable" });
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      renderEditor(save, true);
      const user = userEvent.setup();
      const os = screen.getByRole("button", { name: "Operating system" });
      expect(os).toHaveTextContent("Operating system");
      const zoom = screen.getByRole("spinbutton", { name: "Map zoom" });
      expect(zoom).toHaveValue(null);
      await user.click(screen.getByRole("button", { name: "Save configuration" }));
      await screen.findByRole("alert");
      expect(save).not.toHaveBeenCalled();
      await user.click(os);
      expect(await screen.findByRole("menuitem", { name: "windows" })).toBeInTheDocument();
      expect(screen.queryByRole("menuitem", { name: "android" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("menuitem", { name: "macos" }));
      await user.type(zoom, "15");
      await user.click(screen.getByRole("button", { name: "Save configuration" }));
      await waitFor(() => expect(save).toHaveBeenCalledOnce());
      const command = save.mock.calls[0][0];
      expect(command.operation).toBe("revise");
      if (command.operation !== "revise") throw new Error("Expected revision");
      expect(command.expectedVersion).toBe(monitorUiFixture.version);
      expect(command.definition.axes).toMatchObject({ operatingSystem: "macos", zoom: 15 });
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it("clears incompatible OS and keywords on device changes and only offers the paired systems", async () => {
    const save = vi.fn<SaveMonitor>().mockResolvedValue({ kind: "unavailable" });
    renderEditor(save);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Device" }));
    await user.click(await screen.findByRole("menuitem", { name: "Mobile" }));
    expect(screen.getByRole("button", { name: "Operating system" })).not.toHaveTextContent(
      "windows",
    );
    expect(screen.getByText("0 selected (maximum 20)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Operating system" }));
    expect(await screen.findByRole("menuitem", { name: "android" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "ios" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "windows" })).not.toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
  it("creates a fresh save identity for changed OS and zoom after an unknown network result", async () => {
    const save = vi.fn<SaveMonitor>().mockRejectedValue(new Error("Unknown network outcome"));
    renderEditor(save);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Save configuration" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Operating system" }));
    await user.click(await screen.findByRole("menuitem", { name: "macos" }));
    const zoom = screen.getByRole("spinbutton", { name: "Map zoom" });
    await user.clear(zoom);
    await user.type(zoom, "16");
    await user.click(screen.getByRole("button", { name: "Save configuration" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1][0].idempotencyKey).not.toBe(save.mock.calls[0][0].idempotencyKey);
  });
});
