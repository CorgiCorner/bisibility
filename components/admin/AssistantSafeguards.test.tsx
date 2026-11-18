import {
  instanceAdminFeatureTestMessages,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";

const action = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/assistant-kill-switch", () => ({ setAssistantKillSwitch: action }));

import { AssistantSafeguards } from "./AssistantSafeguards";

const guards = {
  "assistant.guard.platformHourlyCents": 2000,
  "assistant.guard.platformDailyCents": 10000,
  "assistant.guard.unsettledAttempts": 25,
  "assistant.guard.teamDailyCents": 1000,
  "assistant.guard.teamConcurrentTurns": 2,
  "assistant.guard.debtAlertCents": 100,
};

beforeEach(() => action.mockReset());

const trigger = () => screen.getByRole("button", { name: /Assistant status/ });
const reasonField = () => screen.getByRole("textbox", { name: "Reason" });
const applyButton = () => screen.getByRole("button", { name: "Apply" });

async function choose(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(trigger());
  await user.click(await screen.findByRole("menuitem", { name }));
}

it("shows the guards in force and switches the level with a reason through the audited action", async () => {
  const user = userEvent.setup();
  action.mockResolvedValue({ ok: true, level: "hosted_off" });
  renderWithFeatureMessages(<AssistantSafeguards editable guards={guards} level="on" />, {
    messages: instanceAdminFeatureTestMessages,
  });
  expect(screen.getByText("$20.00")).toBeTruthy();
  expect(screen.getByText("$100.00")).toBeTruthy();
  expect(screen.getByText("$10.00")).toBeTruthy();
  expect(screen.getByText("-$1.00")).toBeTruthy();
  await choose(user, "Platform AI providers off");
  await user.type(reasonField(), "  Provider incident ");
  await user.click(applyButton());
  await waitFor(() => expect(action).toHaveBeenCalledWith("hosted_off", "Provider incident"));
  expect(await screen.findByText("Setting saved.")).toBeTruthy();
  expect(trigger().textContent).toContain("Platform AI providers off");
  expect((reasonField() as HTMLInputElement).value).toBe("");
});

it("keeps apply disabled until a level change has a non-blank reason", async () => {
  const user = userEvent.setup();
  renderWithFeatureMessages(<AssistantSafeguards editable guards={guards} level="on" />, {
    messages: instanceAdminFeatureTestMessages,
  });
  expect(applyButton()).toBeDisabled();
  await user.type(reasonField(), "Provider incident");
  // The level has not changed yet: nothing to apply.
  expect(applyButton()).toBeDisabled();
  await user.clear(reasonField());
  await choose(user, "All AI providers off");
  expect(applyButton()).toBeDisabled();
  await user.type(reasonField(), "   ");
  expect(applyButton()).toBeDisabled();
  fireEvent.submit(applyButton().closest("form") as HTMLFormElement);
  expect(await screen.findByText("Enter a reason of up to 500 characters.")).toBeTruthy();
  expect(action).not.toHaveBeenCalled();
  await user.type(reasonField(), "Provider incident");
  expect(applyButton()).toBeEnabled();
  expect(reasonField()).toHaveAttribute("maxlength", "500");
});

it("keeps the level and reports a refused change", async () => {
  const user = userEvent.setup();
  action.mockResolvedValue({ ok: false });
  renderWithFeatureMessages(<AssistantSafeguards editable guards={guards} level="hosted_off" />, {
    messages: instanceAdminFeatureTestMessages,
  });
  await choose(user, "All AI providers on");
  await user.type(reasonField(), "Incident resolved");
  await user.click(applyButton());
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(action).toHaveBeenCalledWith("on", "Incident resolved");
  expect(screen.getByText("Could not save the setting.")).toBeTruthy();
});

it("cannot be changed on a demo instance", () => {
  renderWithFeatureMessages(<AssistantSafeguards editable={false} guards={guards} level="on" />, {
    messages: instanceAdminFeatureTestMessages,
  });
  const select = trigger();
  expect(select.hasAttribute("disabled") || select.getAttribute("aria-disabled") === "true").toBe(
    true,
  );
  fireEvent.click(select);
  expect(screen.queryByRole("menuitem", { name: "All AI providers off" })).toBeNull();
  expect(reasonField()).toBeDisabled();
  expect(applyButton()).toBeDisabled();
  expect(action).not.toHaveBeenCalled();
});

it("sizes the reason field and the apply button like the level select", () => {
  renderWithFeatureMessages(<AssistantSafeguards editable guards={guards} level="on" />, {
    messages: instanceAdminFeatureTestMessages,
  });
  for (const control of [trigger(), reasonField(), applyButton()]) {
    expect(control).toHaveClass("min-h-10", "max-sm:min-h-11", "leading-5");
  }
});

const trip = {
  at: "2026-11-15T22:31:05.000Z",
  reason: "provider_cap_exceeded",
  spendUsd: "487.20",
  capUsd: "500.00",
} as const;

it("explains a switch raised by the AI usage dashboard and hides it once the level changes", async () => {
  const user = userEvent.setup();
  action.mockResolvedValue({ ok: true, level: "on" });
  renderWithFeatureMessages(
    <AssistantSafeguards editable guards={guards} level="hosted_off" trip={trip} />,
    { messages: instanceAdminFeatureTestMessages },
  );
  const banner = screen.getByRole("status");
  expect(banner.textContent).toContain("Platform keys were switched off by the AI usage dashboard");
  expect(banner.textContent).toContain("provider spending cap reached");
  expect(banner.textContent).toContain("Reported spend $487.20 against a cap of $500.00.");
  await choose(user, "All AI providers on");
  await user.type(reasonField(), "Cap raised at the provider");
  await user.click(applyButton());
  await waitFor(() => expect(action).toHaveBeenCalledWith("on", "Cap raised at the provider"));
  await waitFor(() =>
    expect(screen.queryByText(/switched off by the AI usage dashboard/)).toBeNull(),
  );
});

it("shows no trip banner without a trip or while running", () => {
  const { unmount } = renderWithFeatureMessages(
    <AssistantSafeguards editable guards={guards} level="hosted_off" />,
    { messages: instanceAdminFeatureTestMessages },
  );
  expect(screen.queryByText(/AI usage dashboard/)).toBeNull();
  unmount();
  renderWithFeatureMessages(
    <AssistantSafeguards editable guards={guards} level="on" trip={trip} />,
    { messages: instanceAdminFeatureTestMessages },
  );
  expect(screen.queryByText(/AI usage dashboard/)).toBeNull();
});
