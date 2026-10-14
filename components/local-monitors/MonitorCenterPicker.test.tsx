import { sharedMessages } from "@/i18n/core-messages";
import type { SaveMonitor } from "@/lib/local-monitors/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { MonitorForm } from "./MonitorForm";
import { monitorChoiceFixture, monitorUiFixture } from "./monitor-ui.test-fixture";

function setup() {
  const save = vi.fn<SaveMonitor>().mockResolvedValue({ kind: "unavailable" });
  const search = vi.fn();
  const choice = {
    ...monitorChoiceFixture.subjects[0],
    id: "biz_zyxwvutsrqponmlkjihgfedc",
    name: "Other branch",
    address: "Example avenue 2",
    coordinates: { latitude: 0, longitude: 0 },
  };
  render(
    <NextIntlClientProvider locale="en" messages={sharedMessages}>
      <MonitorForm
        projectId="prj_abcdefghijklmnopqrstuvwx"
        current={monitorUiFixture}
        choices={{
          ...monitorChoiceFixture,
          subjects: [
            ...monitorChoiceFixture.subjects,
            choice,
            {
              ...choice,
              id: "biz_second_center",
              name: "Shared center branch",
              address: "Example avenue 3",
            },
            { ...choice, id: "biz_missing", name: "Missing coordinates", coordinates: null },
          ],
        }}
        save={save}
        search={search}
        onSaved={vi.fn()}
        onCancel={vi.fn()}
      />
    </NextIntlClientProvider>,
  );
  return { save, search, user: userEvent.setup() };
}
describe("explicit saved-location measurement center", () => {
  it("finds a saved address and copies only coordinates, including zero, without I/O or changing the subject", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      const { save, search, user } = setup();
      await user.click(screen.getByRole("button", { name: "Choose a saved location" }));
      await user.type(screen.getByPlaceholderText("Search name or address"), "avenue");
      await user.click(screen.getByRole("menuitem", { name: /Other branch/ }));
      expect(screen.getByLabelText("Center latitude")).toHaveValue("0.0000000");
      expect(screen.getByLabelText("Center longitude")).toHaveValue("0.0000000");
      expect(screen.getByText("9 planned points")).toBeInTheDocument();
      expect(save).not.toHaveBeenCalled();
      expect(search).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      await user.click(screen.getByRole("button", { name: "Save configuration" }));
      await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
      const command = save.mock.calls[0][0];
      if (command.operation === "archive") throw new Error("Expected configuration");
      expect(command.definition.locationId).toBe(monitorUiFixture.locationId);
      expect(command.definition.identityRevisionId).toBe(monitorUiFixture.identityRevisionId);
      expect(command.definition.grid).toMatchObject({
        latitude: "0.0000000",
        longitude: "0.0000000",
      });
    } finally {
      fetch.mockRestore();
    }
  });
  it("retains the saved center until explicit choice and disables locations without coordinates", async () => {
    const { user, save } = setup();
    expect(screen.getByLabelText("Center latitude")).toHaveValue(
      monitorUiFixture.grid.center.latitude,
    );
    await user.click(screen.getByRole("button", { name: "Choose a saved location" }));
    expect(screen.getByRole("menuitem", { name: /Missing coordinates/ })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(save).not.toHaveBeenCalled();
  });
  it("keeps the explicitly picked label when two locations share coordinates", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Choose a saved location" }));
    await user.click(screen.getByRole("menuitem", { name: /Shared center branch/ }));
    expect(screen.getByRole("button", { name: "Choose a saved location" })).toHaveTextContent(
      "Shared center branch",
    );
  });
  it("keeps manual fields open and focused through a complete coordinate, and reveals invalid values on submit", async () => {
    const { user, save } = setup();
    const input = screen.getByLabelText("Center latitude");
    const panel = input.closest("details");
    await user.click(screen.getByText("Advanced: enter coordinates"));
    await user.clear(input);
    await user.type(input, "52.2");
    expect(panel).toHaveAttribute("open");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("52.2");
    await user.clear(input);
    await user.type(input, "91");
    await user.click(screen.getByText("Advanced: enter coordinates"));
    await user.click(screen.getByRole("button", { name: "Save configuration" }));
    await waitFor(() => expect(panel).toHaveAttribute("open"));
    expect(
      screen.getByText(
        "These settings cannot produce a grid. Check the coordinates and point spacing.",
      ),
    ).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    await user.clear(input);
    await user.type(input, "52.2");
    await waitFor(() => expect(input).toHaveAttribute("aria-invalid", "false"));
    expect(panel).toHaveAttribute("open");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("52.2");
  });
  it("updates the exact preview when manual coordinates change and exposes point coordinates", async () => {
    const { user } = setup();
    await user.click(screen.getByText("Advanced: enter coordinates"));
    await user.clear(screen.getByLabelText("Center latitude"));
    expect(
      screen.getByText("Choose a center to preview the measurement points."),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Center latitude"), "0");
    await user.click(screen.getByText("View point coordinates"));
    expect(screen.getByRole("table", { name: "View point coordinates" })).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(10);
  });
});
