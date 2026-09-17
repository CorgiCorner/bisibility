import {
  renderWithShellMessages as render,
  renderWithFeatureMessages,
} from "@/i18n/test-support/render-with-feature-messages";
import shellMessages from "@/messages/core/en/shell.json";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppFooter } from "./AppFooter";

vi.mock("@/components/ui/ThemeSegments", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/components/ui/ThemeSegments")>()),
  ThemeSegments: ({ size }: { size?: "sm" | "md" }) => (
    <span data-size={size} data-testid="theme-segments" />
  ),
}));

function expectAdminLink(name: string) {
  const link = screen.getByRole("link", { name });
  expect(link).toHaveAttribute("href", "/app/admin");
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noreferrer noopener");
  expect(link).toHaveClass("[&_svg]:size-[1em]");
  const icon = link.querySelector("svg");
  expect(icon).not.toBeNull();
  expect(icon).toHaveAttribute("aria-hidden", "true");
  return link;
}

const polishShellMessages = {
  ...shellMessages,
  shell: {
    ...shellMessages.shell,
    footer: {
      ...shellMessages.shell.footer,
      instanceStatus: {
        ...shellMessages.shell.footer.instanceStatus,
        healthy: "Administrator instancji",
        manualMode: "Administrator instancji · Tryb reczny",
        schemaDrift: "Administrator instancji · Niezgodny schemat",
        workerDifferentQueues: "Administrator instancji · Rozne kolejki procesu roboczego",
        workerDown: "Administrator instancji · Proces roboczy nie dziala",
      },
    },
  },
};

describe("AppFooter", () => {
  it.each([
    {
      label: "Administrator instancji",
      props: { schemaStatus: "ok", workerStatus: "ok" } as const,
    },
    {
      label: "Administrator instancji · Niezgodny schemat",
      props: { schemaStatus: "drift", workerStatus: "ok" } as const,
    },
    {
      label: "Administrator instancji · Rozne kolejki procesu roboczego",
      props: {
        schemaStatus: "ok",
        temporalIdentityStatus: "mismatch",
        workerStatus: "ok",
      } as const,
    },
    {
      label: "Administrator instancji · Proces roboczy nie dziala",
      props: { schemaStatus: "ok", workerStatus: "stale" } as const,
    },
    {
      label: "Administrator instancji · Tryb reczny",
      props: { schemaStatus: "unknown", workerStatus: "unknown" } as const,
    },
  ])(
    "translates the $label instance-admin status at the shell render boundary",
    ({ label, props }) => {
      renderWithFeatureMessages(<AppFooter {...props} showInstanceAdmin />, {
        locale: "pl",
        messages: polishShellMessages,
      });

      expectAdminLink(label);
      expect(screen.queryByText("Instance admin · Worker down")).not.toBeInTheDocument();
    },
  );

  it("prioritizes schema drift with a red status", () => {
    render(<AppFooter schemaStatus="drift" showInstanceAdmin workerStatus="ok" />);

    expectAdminLink("Instance admin · Schema drift");
    expect(document.querySelector('[style*="var(--red)"]')).toBeInTheDocument();
  });

  it("shows a queue mismatch with schema-drift severity and its comparison detail", () => {
    render(
      <AppFooter
        schemaStatus="ok"
        showInstanceAdmin
        temporalIdentityDetail="app: default / rank-checks / alert-deliveries · worker: default / other-rank-checks / alert-deliveries"
        temporalIdentityStatus="mismatch"
        workerStatus="ok"
      />,
    );

    expectAdminLink("Instance admin · Worker on different queues");
    expect(
      screen.getByText(
        "app: default / rank-checks / alert-deliveries · worker: default / other-rank-checks / alert-deliveries",
      ),
    ).toBeInTheDocument();
    expect(document.querySelector('[style*="var(--red)"]')).toBeInTheDocument();
  });

  it("prioritizes schema drift over a queue mismatch", () => {
    render(
      <AppFooter
        schemaStatus="drift"
        showInstanceAdmin
        temporalIdentityDetail="app: default / rank-checks / alert-deliveries · worker: default / other-rank-checks / alert-deliveries"
        temporalIdentityStatus="mismatch"
        workerStatus="stale"
      />,
    );

    expectAdminLink("Instance admin · Schema drift");
    expect(screen.queryByText(/app: default/)).not.toBeInTheDocument();
  });

  it("prioritizes a queue mismatch over a stale worker", () => {
    render(
      <AppFooter
        schemaStatus="ok"
        showInstanceAdmin
        temporalIdentityDetail="app: default / rank-checks / alert-deliveries · worker: default / other-rank-checks / alert-deliveries"
        temporalIdentityStatus="mismatch"
        workerStatus="stale"
      />,
    );

    expectAdminLink("Instance admin · Worker on different queues");
    expect(document.querySelector('[style*="var(--red)"]')).toBeInTheDocument();
  });

  it("shows a stale worker as down with a yellow status", () => {
    render(<AppFooter schemaStatus="ok" showInstanceAdmin workerStatus="stale" />);

    expectAdminLink("Instance admin · Worker down");
    expect(document.querySelector('[style*="var(--yellow)"]')).toBeInTheDocument();
  });

  it("shows unknown liveness as calm manual mode", () => {
    const { container } = render(
      <AppFooter schemaStatus="unknown" showInstanceAdmin workerStatus="unknown" />,
    );

    expectAdminLink("Instance admin · Manual mode");
    expect(container.querySelector('[role="alert"]')).not.toBeInTheDocument();
    expect(container.querySelector('[style*="var(--yellow)"]')).not.toBeInTheDocument();
    expect(container.querySelector('[style*="var(--red)"]')).not.toBeInTheDocument();
    expect(container.querySelector('[style*="var(--fg-muted)"]')).toBeInTheDocument();
  });

  it("shows a healthy worker with a green status", () => {
    render(<AppFooter schemaStatus="ok" showInstanceAdmin workerStatus="ok" />);

    expectAdminLink("Instance admin");
    expect(document.querySelector('[style*="var(--green)"]')).toBeInTheDocument();
  });

  it("keeps the theme switch visible without exposing instance admin details", () => {
    render(<AppFooter showInstanceAdmin={false} />);

    expect(screen.getByTestId("theme-segments")).toHaveAttribute("data-size", "sm");
    expect(screen.queryByRole("link", { name: /Instance admin/ })).not.toBeInTheDocument();
    expect(document.querySelector('[style*="var(--green)"]')).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Privacy choices" })).toBeVisible();
  });

  it("mounts the theme switch beside the instance status for instance admins", () => {
    render(<AppFooter schemaStatus="ok" showInstanceAdmin workerStatus="ok" />);

    expect(screen.getByTestId("theme-segments")).toHaveAttribute("data-size", "sm");
    expectAdminLink("Instance admin");
  });
});
