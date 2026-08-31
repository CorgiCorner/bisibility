import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  RunChecksConfirmationModal,
  type RunChecksFailure,
  type RunChecksFlow,
} from "./RunChecksConfirmationModal";

const RAW_PROVIDER_MESSAGE = "All SERP providers failed: dataforseo (Ok.)";

function renderFailed(failures: RunChecksFailure[]) {
  const onRetry = vi.fn();
  render(
    <RunChecksConfirmationModal
      flow={{
        completed: 0,
        failures,
        pending: { keywordIds: ["kw_1", "kw_2"] },
        rankCheckIds: [],
        step: "failed",
      }}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
      onRetry={onRetry}
      projectId="prj_demo"
      rows={[]}
    />,
  );
  return { onRetry };
}

function failure(code: string | null, message = RAW_PROVIDER_MESSAGE): RunChecksFailure {
  return { code, message, rankCheckId: "check_abcdefghijklmnopqrstuvwx" };
}

describe("RunChecksConfirmationModal presentation", () => {
  it("renders a plain confirm title and the conjunction in the confirm action", () => {
    render(
      <RunChecksConfirmationModal
        flow={{
          completed: 0,
          failures: [],
          pending: { keywordIds: ["kw_1"] },
          rankCheckIds: [],
          step: "confirm",
        }}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onRetry={vi.fn()}
        projectId="prj_demo"
        rows={[]}
      />,
    );

    const heading = screen.getByRole("heading", { name: "Run rank check" });
    expect(heading.querySelector("svg")).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm and run" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Confirm & run/ })).not.toBeInTheDocument();
  });

  it("renders icon-free running and failed titles", () => {
    const { rerender } = render(
      <RunChecksConfirmationModal
        flow={{
          completed: 0,
          failures: [],
          pending: { keywordIds: ["kw_1"] },
          rankCheckIds: ["check_abcdefghijklmnopqrstuvwx"],
          step: "running",
        }}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onRetry={vi.fn()}
        projectId="prj_demo"
        rows={[]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Check running" }).querySelector("svg")).toBeNull();

    rerender(
      <RunChecksConfirmationModal
        flow={{
          completed: 0,
          failures: [failure("provider_billing")],
          pending: { keywordIds: ["kw_1"] },
          rankCheckIds: [],
          step: "failed",
        }}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        onRetry={vi.fn()}
        projectId="prj_demo"
        rows={[]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Check failed" }).querySelector("svg")).toBeNull();
  });
});

function renderStep(step: RunChecksFlow["step"]) {
  const onClose = vi.fn();
  render(
    <RunChecksConfirmationModal
      flow={{
        completed: step === "success" ? 1 : 0,
        failures: step === "failed" ? [failure("provider_unknown")] : [],
        pending: { keywordIds: ["kw_1"] },
        rankCheckIds: step === "running" ? ["check_abcdefghijklmnopqrstuvwx"] : [],
        step,
      }}
      onClose={onClose}
      onConfirm={vi.fn()}
      onRetry={vi.fn()}
      projectId="prj_demo"
      rows={[]}
    />,
  );
  return { onClose };
}

describe("RunChecksConfirmationModal dismissal", () => {
  it("disables the close button while checks are starting", () => {
    renderStep("starting");

    expect(screen.getByRole("button", { name: "Close modal" })).toBeDisabled();
  });

  it("ignores Escape while checks are starting", () => {
    const { onClose } = renderStep("starting");

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Run rank check" }), { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it.each(["confirm", "running", "success", "failed"] as const)(
    "keeps the %s state dismissible",
    (step) => {
      const { onClose } = renderStep(step);
      const closeButton = screen.getByRole("button", { name: "Close modal" });

      expect(closeButton).toBeEnabled();
      fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
      expect(onClose).toHaveBeenCalledOnce();
    },
  );
});

describe("RunChecksConfirmationModal failures", () => {
  it("replaces a billing provider message and renders the requested footer hierarchy", () => {
    const { onRetry } = renderFailed([failure("provider_billing")]);

    expect(screen.queryByText(RAW_PROVIDER_MESSAGE)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "The rank check could not run because the provider account has insufficient funds. Add funds or connect a different provider, then try again.",
      ),
    ).toBeInTheDocument();

    const dialog = screen.getByRole("dialog", { name: "Checks failed" });
    const footer = dialog.querySelector("footer");
    if (!footer) throw new Error("Expected a modal footer.");
    expect(within(footer).getByRole("link", { name: "View check details" })).toHaveAttribute(
      "href",
      "/app/prj_demo/rank-tracker?tab=checks&run=check_abcdefghijklmnopqrstuvwx",
    );
    expect(within(footer).getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(within(footer).getByRole("link", { name: "Open integrations" })).toBeInTheDocument();
    expect(footer.querySelectorAll("a, button")).toHaveLength(3);

    fireEvent.click(within(footer).getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("uses safe generic copy for an unknown provider error", () => {
    renderFailed([failure("provider_unknown", "Provider account secret details")]);

    expect(screen.queryByText("Provider account secret details")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "The rank check could not run because of a provider error. Try again, or view check details for more information.",
      ),
    ).toBeInTheDocument();
  });

  it("uses the dominant recognized provider code regardless of failure order", () => {
    renderFailed([
      failure("provider_transient", "Transient raw message"),
      failure("provider_billing", "Billing raw message"),
    ]);

    expect(screen.queryByText("Transient raw message")).not.toBeInTheDocument();
    expect(screen.queryByText("Billing raw message")).not.toBeInTheDocument();
    expect(screen.getByText(/provider account has insufficient funds/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open integrations" })).toBeInTheDocument();
  });

  it("preserves an app-authored immediate block message", () => {
    renderFailed([
      {
        code: "sample_project",
        message: "Sample projects don't run real checks.",
        rankCheckId: null,
      },
    ]);

    expect(screen.getByText("Sample projects don't run real checks.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
  it.each([
    [
      "deferred first",
      [failure("rank_check_deferred", "Deferred neutral copy"), failure("provider_auth")],
    ],
    [
      "provider first",
      [failure("provider_auth"), failure("rank_check_deferred", "Deferred neutral copy")],
    ],
  ])("prioritizes deferred feedback for mixed failures when %s", (_label, failures) => {
    renderFailed(failures);

    expect(screen.getByRole("alert")).toHaveTextContent("Deferred neutral copy");
    expect(screen.queryByText(/because of a provider error/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open integrations" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View check details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("preserves deferred copy with details and retry but no integrations action", () => {
    renderFailed([
      failure(
        "rank_check_deferred",
        "The rank check was deferred and did not complete. View check details for more information, then try again when the blocking condition is resolved.",
      ),
    ]);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The rank check was deferred and did not complete.",
    );
    expect(screen.getByRole("link", { name: "View check details" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open integrations" })).not.toBeInTheDocument();
  });
});
