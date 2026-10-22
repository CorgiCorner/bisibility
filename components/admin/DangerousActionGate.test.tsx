import {
  renderWithInstanceAdminMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import en from "@/messages/core/en/instance-admin.json";
import es from "@/messages/core/es-ES/instance-admin.json";
import ja from "@/messages/core/ja/instance-admin.json";
import pl from "@/messages/core/pl/instance-admin.json";
import { setNavigationState } from "@/tests/next-navigation";
import { screen } from "@testing-library/react";
import { beforeEach, expect, it } from "vitest";
import { DangerousActionAccessProvider, DangerousActionGate } from "./DangerousActionGate";

beforeEach(() =>
  setNavigationState({ pathname: "/app/admin/administration", searchParams: { tab: "mail" } }),
);

it("replaces dangerous controls with enrollment guidance and the current return path", () => {
  render(
    <DangerousActionAccessProvider allowed={false}>
      <DangerousActionGate action="changeMail">
        <button type="button">Save mail</button>
      </DangerousActionGate>
    </DangerousActionAccessProvider>,
  );
  expect(screen.queryByRole("button", { name: "Save mail" })).not.toBeInTheDocument();
  expect(
    screen.getByText("Enable two-factor authentication to change mail settings."),
  ).toBeVisible();
  expect(screen.getByRole("link")).toHaveAttribute(
    "href",
    "/app/account/security?returnTo=%2Fapp%2Fadmin%2Fadministration%3Ftab%3Dmail",
  );
});

it("renders controls when enrollment or self-host policy permits the action", () => {
  render(
    <DangerousActionAccessProvider allowed>
      <DangerousActionGate action="addAccount">
        <button type="button">Add account</button>
      </DangerousActionGate>
    </DangerousActionAccessProvider>,
  );
  expect(screen.getByRole("button", { name: "Add account" })).toBeVisible();
  expect(screen.queryByRole("note")).not.toBeInTheDocument();
});

it("fails closed without the admin access provider", () => {
  render(
    <DangerousActionGate action="changeCredentials">
      <button type="button">Replace credentials</button>
    </DangerousActionGate>,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.getByRole("note")).toHaveTextContent(
    "Enable two-factor authentication to change credentials.",
  );
});

it.each([
  ["en", en],
  ["pl", pl],
  ["es-ES", es],
  ["ja", ja],
] as const)("localizes the shared gate in %s", (locale, messages) => {
  renderWithFeatureMessages(
    <DangerousActionGate action="changeMail">
      <button type="button">Save</button>
    </DangerousActionGate>,
    { locale, messages },
  );
  const copy = messages.instanceAdmin.dangerousActions;
  expect(screen.getByRole("note")).toHaveTextContent(
    copy.notice.replace("{action}", copy.actions.changeMail),
  );
  expect(screen.getByRole("link", { name: copy.enable })).toBeVisible();
});
