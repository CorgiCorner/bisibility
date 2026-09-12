import { DialogSurface as Dialog } from "@/components/ui/DialogSurface";
import type { ReactNode } from "react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  demo: { value: null as object | null },
  deployment: { isCloud: true },
  deploymentModeProvider: vi.fn(),
  firstRunGate: vi.fn(),
  renderOnboardingQuizSlot: vi.fn(),
  renderSupportWidget: vi.fn(() => <aside data-testid="support-extension" />),
  requireSession: vi.fn(),
  toastProvider: vi.fn(),
}));

vi.mock("@/components/ui/Toast", () => ({
  ToastProvider: ({ children }: { children: ReactNode }) => {
    mocks.toastProvider();
    return children;
  },
}));
vi.mock("@/components/shell/DeploymentModeProvider", () => ({
  DeploymentModeProvider: ({
    children,
    deploymentMode,
  }: {
    children: ReactNode;
    deploymentMode: string;
  }) => {
    mocks.deploymentModeProvider(deploymentMode);
    return children;
  },
}));
vi.mock("@/lib/auth/first-run", () => ({
  redirectToSetupIfFirstRun: mocks.firstRunGate,
}));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.requireSession }));
vi.mock("@/lib/dates/request", () => ({
  getResolvedDateFormat: vi.fn().mockResolvedValue({ preference: "auto", resolved: "month_first" }),
}));
vi.mock("@/lib/deployment/deployment", () => ({
  get isCloud() {
    return mocks.deployment.isCloud;
  },
}));
vi.mock("@/lib/demo/config", () => ({ readDemoConfig: () => mocks.demo.value }));
vi.mock("@/lib/app-extensions", () => ({
  appExtensions: {
    renderOnboardingQuizSlot: mocks.renderOnboardingQuizSlot,
    renderSupportWidget: mocks.renderSupportWidget,
  },
}));
vi.mock("@/lib/seo/noindex", () => ({ createNoindexMetadata: () => ({}) }));

import AppLayout from "./layout";

function DashboardShell() {
  return <main data-delayed-shell>Dashboard</main>;
}

function QuizDialog() {
  return (
    <Dialog
      aria-labelledby="quiz-title"
      open
      duration={{ enter: 0, exit: 0 }}
      onClose={() => undefined}
    >
      <section>
        <h2 id="quiz-title">Welcome to bisibility</h2>
      </section>
    </Dialog>
  );
}

function setActEnvironment(enabled: boolean) {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = enabled;
}

describe("shared app layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.demo.value = { kind: "disabled" };
    mocks.deployment.isCloud = true;
    mocks.firstRunGate.mockResolvedValue(undefined);
    mocks.renderOnboardingQuizSlot.mockImplementation(async (children: ReactNode) => (
      <>
        <div data-app-modal-background>{children}</div>
        <div data-quiz-slot>Quiz slot</div>
      </>
    ));
    mocks.requireSession.mockResolvedValue({
      session: { expiresAt: new Date("2026-09-10T12:00:00.000Z") },
      user: { id: "admin_1" },
    });
  });

  afterEach(() => {
    document.body.replaceChildren();
    setActEnvironment(false);
    vi.restoreAllMocks();
  });

  it("does not invoke the quiz slot when authentication rejects", async () => {
    mocks.requireSession.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));

    await expect(AppLayout({ children: <div>Hidden</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
    expect(mocks.firstRunGate).toHaveBeenCalledOnce();
    expect(mocks.renderOnboardingQuizSlot).not.toHaveBeenCalled();
    expect(mocks.renderSupportWidget).not.toHaveBeenCalled();
  });

  it("does not invoke authentication or the quiz slot when setup redirects", async () => {
    mocks.firstRunGate.mockRejectedValue(new Error("NEXT_REDIRECT:/setup"));

    await expect(AppLayout({ children: <div>Hidden</div> })).rejects.toThrow(
      "NEXT_REDIRECT:/setup",
    );

    expect(mocks.requireSession).not.toHaveBeenCalled();
    expect(mocks.renderOnboardingQuizSlot).not.toHaveBeenCalled();
    expect(mocks.renderSupportWidget).not.toHaveBeenCalled();
  });

  it("passes the exact children to the decorator once after both gates succeed", async () => {
    const children = <div>Nested route layout</div>;
    await AppLayout({ children });

    expect(mocks.firstRunGate).toHaveBeenCalledOnce();
    expect(mocks.requireSession).toHaveBeenCalledOnce();
    expect(mocks.renderOnboardingQuizSlot).toHaveBeenCalledOnce();
    expect(mocks.renderOnboardingQuizSlot.mock.calls[0][0]).toBe(children);
    expect(mocks.renderSupportWidget).toHaveBeenCalledWith({
      expiresAt: new Date("2026-09-10T12:00:00.000Z"),
      userId: "admin_1",
    });
    expect(mocks.firstRunGate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.requireSession.mock.invocationCallOrder[0],
    );
    expect(mocks.requireSession.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.renderOnboardingQuizSlot.mock.invocationCallOrder[0],
    );
  });

  it.each([
    ["self-host", false, { kind: "disabled" }],
    ["legacy demo", true, { kind: "legacy-read-only" }],
    ["editable demo", true, { kind: "editable" }],
  ])("does not render support or recording for %s", async (_name, isCloud, demo) => {
    mocks.deployment.isCloud = isCloud;
    mocks.demo.value = demo;

    const result = await AppLayout({ children: <div>Nested route layout</div> });

    expect(renderToStaticMarkup(result)).not.toContain('data-testid="support-extension"');
    expect(mocks.renderSupportWidget).not.toHaveBeenCalled();
    if (demo.kind !== "disabled") {
      expect(mocks.renderOnboardingQuizSlot).not.toHaveBeenCalled();
    }
  });

  it("renders the decorated result inside both providers", async () => {
    const result = await AppLayout({ children: <div>Nested route layout</div> });
    const markup = renderToStaticMarkup(result);

    expect(mocks.toastProvider).toHaveBeenCalledOnce();
    expect(mocks.deploymentModeProvider).toHaveBeenCalledWith("cloud");
    expect(markup).toContain("Nested route layout");
    expect(markup).toContain("Quiz slot");
    expect(markup).toContain("data-app-modal-background");
    expect(markup).toContain('data-testid="support-extension"');
    expect(markup.indexOf("Nested route layout")).toBeLessThan(markup.indexOf("Quiz slot"));
  });

  it("renders just children when the decorator returns them undecorated", async () => {
    mocks.renderOnboardingQuizSlot.mockImplementation(async (children: ReactNode) => children);

    const result = await AppLayout({ children: <div>Nested route layout</div> });
    const markup = renderToStaticMarkup(result);

    expect(markup).toBe(
      '<aside data-testid="support-extension"></aside><div>Nested route layout</div>',
    );
  });

  it("gives MUI a stable modal background instead of mutating the hydrated shell", async () => {
    setActEnvironment(true);
    mocks.renderOnboardingQuizSlot.mockImplementation(async (children: ReactNode) => (
      <>
        <div data-app-modal-background>{children}</div>
        <QuizDialog />
      </>
    ));
    const serverTree = await AppLayout({ children: <DashboardShell /> });
    document.body.innerHTML = renderToString(serverTree);
    const clientTree = await AppLayout({ children: <DashboardShell /> });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const root = hydrateRoot(document.body, clientTree);
    await act(async () => undefined);
    await vi.waitFor(() => {
      expect(document.querySelector("[data-app-modal-background]")).toHaveAttribute(
        "aria-hidden",
        "true",
      );
    });

    const background = document.querySelector("[data-app-modal-background]");
    const shell = document.querySelector("[data-delayed-shell]");
    const dialog = document.querySelector('[role="dialog"]');
    expect(background).toHaveAttribute("aria-hidden", "true");
    expect(shell).not.toHaveAttribute("aria-hidden");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-labelledby", "quiz-title");
    expect(consoleError).not.toHaveBeenCalled();

    await act(async () => root.unmount());
  });
});
