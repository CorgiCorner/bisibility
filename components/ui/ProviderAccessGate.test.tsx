import { renderWithResearchMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ProviderAccessEmptyState } from "./ProviderAccessEmptyState";
import { ProviderAccessGate } from "./ProviderAccessGate";

it("shows capability-specific providers and a link while locking all descendant fields", () => {
  render(
    <ProviderAccessGate
      blocked
      providers={["Example keyword provider"]}
      href="/app/prj_example/integrations"
    >
      <input aria-label="Seeds" />
      <button type="button">Research</button>
    </ProviderAccessGate>,
  );
  expect(screen.getAllByText("Connect a supporting provider to unlock these fields.")).toHaveLength(
    1,
  );
  expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Seeds" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Research" })).toBeDisabled();
  expect(screen.getByText("Supported providers: Example keyword provider.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open Integrations" })).toHaveAttribute(
    "href",
    "/app/prj_example/integrations",
  );
});
it("keeps available fields editable and omits the lock notice", () => {
  render(
    <ProviderAccessGate blocked={false}>
      <input aria-label="Seeds" />
    </ProviderAccessGate>,
  );
  expect(screen.getByRole("textbox", { name: "Seeds" })).not.toBeDisabled();
  expect(screen.queryByText(/Connect a supporting/)).not.toBeInTheDocument();
});

it("offers one reconnect action with capability-specific providers", () => {
  render(
    <ProviderAccessGate
      blocked
      reconnect
      providers={["Fixture provider"]}
      href="/app/prj_1/integrations"
    >
      <input aria-label="Target" />
    </ProviderAccessGate>,
  );
  expect(screen.getByText("Reconnect your provider to unlock these fields.")).toBeVisible();
  expect(screen.getAllByRole("link")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Reconnect provider" })).toHaveAttribute(
    "href",
    "/app/prj_1/integrations",
  );
  expect(screen.getByText("Supported providers: Fixture provider.")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Target" })).toBeDisabled();
});

it("opens Integrations without promising a compatible provider when none is available", () => {
  render(<ProviderAccessEmptyState href="/app/prj_1/integrations" providers={[]} />);
  expect(
    screen.getByRole("heading", { name: "No supporting provider is available for this feature." }),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Open Integrations" })).toHaveAttribute(
    "href",
    "/app/prj_1/integrations",
  );
  expect(screen.queryByRole("link", { name: "Connect provider" })).not.toBeInTheDocument();
  expect(screen.queryByText(/Connect one in Integrations/)).not.toBeInTheDocument();
});
