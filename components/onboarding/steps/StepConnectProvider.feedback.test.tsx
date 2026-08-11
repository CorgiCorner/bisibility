import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clickTestConnection, push, renderProviderStep } from "./StepConnectProvider.test-utils";

describe("StepConnectProvider feedback", () => {
  beforeEach(() => {
    push.mockClear();
  });

  it("shows a visible action error when the submit test fails", async () => {
    const onComplete = vi.fn();
    const connectProviderAction = vi.fn(async (_input: unknown) => undefined);
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => ({
      message: "Invalid credentials",
      ok: false,
    }));
    const { container } = renderProviderStep({
      connectProviderAction,
      onComplete,
      testProviderConnectionAction,
    });

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));

    expect(
      await within(screen.getByRole("status")).findByText("Invalid credentials"),
    ).toBeInTheDocument();
    fireEvent.submit(container.querySelector("form") as HTMLFormElement);

    expect(await screen.findByText("Save a provider before continuing.")).toBeInTheDocument();
    expect(connectProviderAction).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("keeps test progress on the button and the settled slots quiet", async () => {
    let resolveTest: ((result: { message: string; ok: boolean }) => void) | undefined;
    const testProviderConnectionAction = vi.fn(
      async (_input: unknown) =>
        new Promise<{ message: string; ok: boolean }>((resolve) => {
          resolveTest = resolve;
        }),
    );
    const { container } = renderProviderStep({ testProviderConnectionAction });

    fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(testProviderConnectionAction).toHaveBeenCalledTimes(1));

    const button = screen.getByRole("button", { name: "Test connection" });
    const spinnerSelector = ".bv-spin, .MuiCircularProgress-root";
    expect(container.querySelectorAll(spinnerSelector)).toHaveLength(1);
    expect(button.querySelectorAll(spinnerSelector)).toHaveLength(1);
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByText("Testing...")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await act(async () => resolveTest?.({ message: "Connected", ok: true }));

    await waitFor(() => expect(button).not.toHaveAttribute("aria-busy"));
    expect(within(screen.getByRole("status")).getByText("DataForSEO verified")).toBeInTheDocument();
  });

  it("keeps the previous pill result during a retest", async () => {
    let attempt = 0;
    let resolveRetest: ((result: { message: string; ok: boolean }) => void) | undefined;
    const testProviderConnectionAction = vi.fn(async (_input: unknown) => {
      attempt += 1;
      if (attempt === 1) return { message: "Connected", ok: true };
      return new Promise<{ message: string; ok: boolean }>((resolve) => {
        resolveRetest = resolve;
      });
    });
    renderProviderStep({ testProviderConnectionAction });

    await clickTestConnection(testProviderConnectionAction);
    expect(await screen.findByText("Verified")).toBeInTheDocument();

    await clickTestConnection(testProviderConnectionAction, 2);
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.queryByText("Testing...")).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await act(async () => resolveRetest?.({ message: "Credentials expired", ok: false }));

    expect(await screen.findByText("Test failed")).toBeInTheDocument();
    expect(within(screen.getByRole("status")).getByText("Credentials expired")).toBeInTheDocument();
  });
});
