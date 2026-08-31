import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KeywordFirstCheckModal } from "./KeywordFirstCheckModal";

const baseProps = {
  errorCode: null as string | null,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  onContinue: vi.fn(),
  onTryAgain: vi.fn(),
  position: null as number | null,
  projectRef: "prj_demo",
  rankCheckId: null as string | null,
  requestedDepth: null as number | null,
};

describe("KeywordFirstCheckModal", () => {
  it("confirms the selected depth without starting until Confirm and run", () => {
    const onConfirm = vi.fn();
    render(
      <KeywordFirstCheckModal
        {...baseProps}
        confirmError={null}
        confirming={false}
        costLabel="~$0.02"
        depth={100}
        onConfirm={onConfirm}
        open
        step="confirm"
      />,
    );

    expect(screen.getByRole("dialog", { name: "Run rank check" })).toBeInTheDocument();
    expect(screen.getByText("1 keyword")).toBeInTheDocument();
    expect(screen.getByText("Top 100")).toBeInTheDocument();
    expect(screen.getByText("~$0.02")).toBeInTheDocument();
    expect(onConfirm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm and run" }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("tells the user the check is processing now while the run starts", () => {
    render(
      <KeywordFirstCheckModal
        {...baseProps}
        confirmError={null}
        confirming
        costLabel={null}
        depth={20}
        open
        step="confirm"
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("The check is processing now.");
    expect(screen.getByRole("button", { name: "Starting..." })).toBeDisabled();
  });

  it("keeps a blocked run in the dialog", () => {
    render(
      <KeywordFirstCheckModal
        {...baseProps}
        confirmError="A rank check is already queued or running."
        confirming={false}
        costLabel={null}
        depth={20}
        open
        step="confirm"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "A rank check is already queued or running.",
    );
  });

  it("shows the running step copy and a Close button", () => {
    const onClose = vi.fn();
    render(
      <KeywordFirstCheckModal
        {...baseProps}
        confirmError={null}
        confirming={false}
        costLabel={null}
        depth={20}
        onClose={onClose}
        open
        step="running"
      />,
    );

    expect(screen.getByRole("dialog", { name: "Check running" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Check running. This usually takes about a minute. You can close this window - the result will appear on this page.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows ranked position on the success step", () => {
    const onContinue = vi.fn();
    render(
      <KeywordFirstCheckModal
        {...baseProps}
        confirmError={null}
        confirming={false}
        costLabel={null}
        depth={100}
        onContinue={onContinue}
        open
        position={12}
        requestedDepth={100}
        step="success"
      />,
    );

    expect(screen.getByRole("dialog", { name: "Check complete" })).toBeInTheDocument();
    expect(screen.getByText("Ranked #12 in the top 100.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("shows not-ranked copy on the success step for a null position", () => {
    render(
      <KeywordFirstCheckModal
        {...baseProps}
        confirmError={null}
        confirming={false}
        costLabel={null}
        depth={20}
        open
        position={null}
        requestedDepth={20}
        step="success"
      />,
    );

    expect(screen.getByText("Not ranked in the top 20 yet.")).toBeInTheDocument();
  });

  it("falls back to the selected depth when requestedDepth is null", () => {
    render(
      <KeywordFirstCheckModal
        {...baseProps}
        confirmError={null}
        confirming={false}
        costLabel={null}
        depth={20}
        open
        position={5}
        requestedDepth={null}
        step="success"
      />,
    );

    expect(screen.getByText("Ranked #5 in the top 20.")).toBeInTheDocument();
  });

  it("renders billing failure copy with Open integrations and Try again CTAs", () => {
    render(
      <KeywordFirstCheckModal
        {...baseProps}
        confirmError={null}
        confirming={false}
        costLabel={null}
        depth={20}
        errorCode="provider_billing"
        open
        step="failed"
      />,
    );

    const failedDialog = screen.getByRole("dialog", { name: "Check failed" });
    expect(failedDialog).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Check failed" }).querySelector("svg")).toBeNull();
    expect(failedDialog.querySelector('[class*="h-10"]')).toBeNull();
    expect(
      screen.getByText(
        "The rank check could not run because the provider account has insufficient funds. Add funds or connect a different provider, then try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open integrations" })).toHaveAttribute(
      "href",
      "/app/prj_demo/integrations",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("renders auth failure copy with only the Open integrations CTA", () => {
    render(
      <KeywordFirstCheckModal
        {...baseProps}
        confirmError={null}
        confirming={false}
        costLabel={null}
        depth={20}
        errorCode="provider_auth"
        open
        step="failed"
      />,
    );

    expect(
      screen.getByText(
        "The rank check could not run because the provider credentials were rejected. Reconnect the provider, then try again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open integrations" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View check details" })).toBeInTheDocument();
  });

  it("renders transient failure copy with Try again and View check details CTAs", () => {
    render(
      <KeywordFirstCheckModal
        {...baseProps}
        confirmError={null}
        confirming={false}
        costLabel={null}
        depth={20}
        errorCode="provider_rate_limited"
        rankCheckId="check_abcdefghijklmnopqrstuvwx"
        open
        step="failed"
      />,
    );

    expect(
      screen.getByText(
        "The rank check could not run because the provider is temporarily rate limited. Try again in a few minutes.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "View check details" });
    expect(link).toHaveAttribute(
      "href",
      "/app/prj_demo/rank-tracker?tab=checks&run=check_abcdefghijklmnopqrstuvwx",
    );
  });

  it("never renders a raw provider failure message", () => {
    render(
      <KeywordFirstCheckModal
        {...baseProps}
        confirmError="Provider secret account detail"
        confirming={false}
        costLabel={null}
        depth={20}
        errorCode="provider_transient"
        open
        step="failed"
      />,
    );

    expect(screen.queryByText("Provider secret account detail")).not.toBeInTheDocument();
    expect(screen.getByText(/provider is temporarily unavailable/)).toBeInTheDocument();
  });

  it("treats null error code as transient failure copy", () => {
    render(
      <KeywordFirstCheckModal
        {...baseProps}
        confirmError={null}
        confirming={false}
        costLabel={null}
        depth={20}
        errorCode={null}
        open
        step="failed"
      />,
    );

    expect(
      screen.getByText(
        "The rank check could not run because of a provider error. Try again, or view check details for more information.",
      ),
    ).toBeInTheDocument();
  });

  it("falls back to the Checks tab when transient failure has no run id", () => {
    render(
      <KeywordFirstCheckModal
        {...baseProps}
        confirmError={null}
        confirming={false}
        costLabel={null}
        depth={20}
        errorCode="provider_rate_limited"
        rankCheckId={null}
        open
        step="failed"
      />,
    );

    const link = screen.getByRole("link", { name: "View check details" });
    expect(link).toHaveAttribute("href", "/app/prj_demo/rank-tracker?tab=checks");
  });

  it("Try again calls the handler", () => {
    const onTryAgain = vi.fn();
    render(
      <KeywordFirstCheckModal
        {...baseProps}
        confirmError={null}
        confirming={false}
        costLabel={null}
        depth={20}
        errorCode="provider_billing"
        onTryAgain={onTryAgain}
        open
        step="failed"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onTryAgain).toHaveBeenCalledOnce();
  });
});
