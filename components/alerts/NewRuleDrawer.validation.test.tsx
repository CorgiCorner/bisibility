import { renderWithAlertMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { NewRuleDrawer } from "./NewRuleDrawer";

vi.mock("@/components/ui/Sheet", () => ({
  Sheet: ({
    children,
    footer,
    onClose,
  }: {
    children: ReactNode;
    footer: ReactNode;
    onClose: () => void;
  }) => (
    <div>
      <button type="button" onClick={onClose}>
        Dismiss drawer
      </button>
      {children}
      {footer}
    </div>
  ),
}));

it("keeps validation slots mounted, associates the name error and blocks invalid creation", async () => {
  const create = vi.fn();
  render(
    <NewRuleDrawer
      actions={{
        createAlertRuleAction: create,
        updateAlertRuleAction: vi.fn(),
        deleteWebhookEndpointAction: vi.fn(),
        testWebhookEndpointAction: vi.fn(),
        upsertWebhookEndpointAction: vi.fn(),
      }}
      canManageEndpoints={false}
      onClose={vi.fn()}
      open
      projectId="project_1"
      targets={{ keywords: [], markets: [], members: [], tags: [] }}
    />,
  );
  const name = screen.getByRole("textbox", { name: "Rule name" });
  const nameSlot = document.getElementById("alert-rule-name-error");
  const actionSlot = screen.getByTestId("alert-rule-action-error");
  expect(nameSlot).toHaveClass("h-8", "overflow-y-auto");
  expect(actionSlot).toHaveClass("h-14", "overflow-y-auto");
  fireEvent.change(name, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Create paused" }));
  await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "true"));
  expect(name).toHaveAccessibleDescription("Name the rule.");
  expect(document.getElementById("alert-rule-name-error")).toBe(nameSlot);
  expect(screen.getByRole("alert")).toHaveTextContent("Name the rule.");
  expect(create).not.toHaveBeenCalled();
  fireEvent.change(name, { target: { value: "app-ux-test-rule" } });
  await waitFor(() => expect(name).toHaveAttribute("aria-invalid", "false"));
  expect(nameSlot).toBeEmptyDOMElement();
  expect(screen.getByTestId("alert-rule-action-error")).toBe(actionSlot);
});

it("confirms a dirty drawer close and preserves edits when cancelled", async () => {
  const close = vi.fn();
  render(
    <NewRuleDrawer
      actions={{
        createAlertRuleAction: vi.fn(),
        updateAlertRuleAction: vi.fn(),
        deleteWebhookEndpointAction: vi.fn(),
        testWebhookEndpointAction: vi.fn(),
        upsertWebhookEndpointAction: vi.fn(),
      }}
      canManageEndpoints={false}
      onClose={close}
      open
      projectId="project_1"
      targets={{ keywords: [], markets: [], members: [], tags: [] }}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Rule name" }), {
    target: { value: "Changed rule" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Dismiss drawer" }));
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toHaveTextContent("Discard unsaved changes?");
  fireEvent.click(screen.getByRole("button", { name: "Keep editing" }));
  expect(screen.getByRole("textbox", { name: "Rule name" })).toHaveValue("Changed rule");
  fireEvent.click(screen.getByRole("button", { name: "Dismiss drawer" }));
  fireEvent.click(screen.getByRole("button", { name: "Discard changes" }));
  expect(close).toHaveBeenCalledOnce();
});

it("keeps a pending save open and disables discard until its result arrives", async () => {
  const close = vi.fn();
  let resolve!: (value: unknown) => void;
  const create = vi.fn(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  render(
    <NewRuleDrawer
      actions={{
        createAlertRuleAction: create,
        updateAlertRuleAction: vi.fn(),
        deleteWebhookEndpointAction: vi.fn(),
        testWebhookEndpointAction: vi.fn(),
        upsertWebhookEndpointAction: vi.fn(),
      }}
      canManageEndpoints={false}
      onClose={close}
      open
      projectId="project_1"
      targets={{ keywords: [], markets: [], members: [], tags: [] }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Create paused" }));
  await waitFor(() => expect(create).toHaveBeenCalledOnce());
  fireEvent.click(screen.getByRole("button", { name: "Dismiss drawer" }));
  expect(screen.getByRole("dialog")).toHaveTextContent("Saving is still in progress.");
  expect(screen.getByRole("button", { name: "Discard changes" })).toBeDisabled();
  expect(close).not.toHaveBeenCalled();
  await act(async () => resolve({}));
  expect(close).toHaveBeenCalledOnce();
});
