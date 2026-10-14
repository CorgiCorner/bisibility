import { sharedMessages as messages } from "@/i18n/core-messages";
import type { SaveMonitor, SetupChoices } from "@/lib/local-monitors/contracts";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { MonitorForm } from "./MonitorForm";
import { monitorChoiceFixture, monitorUiFixture } from "./monitor-ui.test-fixture";

const choices: SetupChoices = {
  subjects: [],
  keywords: [],
  subjectsMore: false,
  keywordsMore: false,
  nextSubject: null,
  nextKeyword: null,
  permissions: { canRead: true, canWrite: false },
};
describe("monitor editor", () => {
  it("does not persist or make provider requests on render; viewer controls remain disabled", async () => {
    const save = vi.fn();
    const search = vi.fn();
    const fetch = vi.spyOn(globalThis, "fetch");
    try {
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <MonitorForm
            projectId="prj_abcdefghijklmnopqrstuvwx"
            choices={choices}
            save={save}
            search={search}
            onSaved={vi.fn()}
            onCancel={vi.fn()}
          />
        </NextIntlClientProvider>,
      );
      expect(screen.getByRole("button", { name: "Save configuration" })).toBeDisabled();
      expect(save).not.toHaveBeenCalled();
      expect(search).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
      await userEvent.setup().click(screen.getByRole("button", { name: /cancel/i }));
      expect(save).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it("reuses the same idempotency key after an unknown network result", async () => {
    const onSaved = vi.fn();
    const save = vi
      .fn<SaveMonitor>()
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValue({
        kind: "saved",
        receipt: {
          monitorId: monitorUiFixture.id,
          version: 2,
          revisionId: "next-revision",
          scheduleIntentId: "owned-fixture-intent",
          state: "active",
        },
      });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MonitorForm
          projectId="prj_abcdefghijklmnopqrstuvwx"
          current={monitorUiFixture}
          choices={monitorChoiceFixture}
          save={save}
          search={vi.fn()}
          onSaved={onSaved}
          onCancel={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Save configuration" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Save configuration" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(monitorUiFixture.id));
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1]?.[0]).toEqual(save.mock.calls[0]?.[0]);
  });
  it("uses a new idempotency key when the definition changes after an unknown result", async () => {
    const save = vi.fn<SaveMonitor>().mockRejectedValue(new Error("Network unavailable"));
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MonitorForm
          projectId="prj_abcdefghijklmnopqrstuvwx"
          current={monitorUiFixture}
          choices={monitorChoiceFixture}
          save={save}
          search={vi.fn()}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Save configuration" }));
    await screen.findByRole("alert");
    await user.type(screen.getByLabelText("Name"), " revised");
    await user.click(screen.getByRole("button", { name: "Save configuration" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save.mock.calls[1]?.[0].idempotencyKey).not.toEqual(
      save.mock.calls[0]?.[0].idempotencyKey,
    );
  });
  it("displays and preserves saved operating-system and zoom constraints on revision", async () => {
    const save = vi.fn<SaveMonitor>().mockResolvedValue({ kind: "unavailable" });
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MonitorForm
          projectId="prj_abcdefghijklmnopqrstuvwx"
          current={{
            ...monitorUiFixture,
            axes: { ...monitorUiFixture.axes, operatingSystem: "windows", zoom: 14 },
          }}
          choices={monitorChoiceFixture}
          save={save}
          search={vi.fn()}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Operating system" })).toHaveTextContent("windows");
    expect(screen.getByRole("spinbutton", { name: "Map zoom" })).toHaveValue(14);
    await userEvent.setup().click(screen.getByRole("button", { name: "Save configuration" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const command = save.mock.calls[0][0];
    if (command.operation === "archive") throw new Error("Expected definition save");
    expect(command.definition.axes).toMatchObject({ operatingSystem: "windows", zoom: 14 });
  });
  it("rejects incomplete explicit selection and exposes a useful keyboard validation message", async () => {
    const save = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <MonitorForm
          projectId="prj_abcdefghijklmnopqrstuvwx"
          choices={{ ...choices, permissions: { canRead: true, canWrite: true } }}
          save={save}
          search={vi.fn()}
          onSaved={vi.fn()}
          onCancel={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "Save configuration" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
  });
});
