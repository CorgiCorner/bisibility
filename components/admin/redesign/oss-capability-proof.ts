import type { RenderResult } from "@testing-library/react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, vi } from "vitest";
import type { Entry } from "./oss-capability-types";
export async function assertCapability(
  { proof, id }: Entry,
  story: string,
  interaction: string[],
  result: RenderResult,
) {
  expect(proof, `Missing proof for ${id}`).toBeDefined();
  let target: HTMLElement =
    proof.role === "status" ||
    interaction.includes("announcement-create") ||
    interaction.includes("announcement-delete-dialog") ||
    interaction.includes("announcement-invalid-link") ||
    interaction.includes("mail-select") ||
    interaction.includes("announcement-edit") ||
    interaction.includes("announcement-error") ||
    interaction.some((step) => step.startsWith("account-") && step !== "account-copy") ||
    interaction.includes("focus-worker") ||
    interaction.includes("project-filter") ||
    interaction.includes("mail-provider-menu") ||
    interaction.includes("closed-unknown") ||
    interaction.includes("save-deadline") ||
    interaction.some((step) => step.startsWith("recovery-detail")) ||
    interaction.includes("recovery-category") ||
    story.startsWith("RecoveryPreview") ||
    story.startsWith("RecoveryStepUp") ||
    story.startsWith("RecoveryBatch") ||
    story === "RecoveryDetail" ||
    story === "RecoveryBatch"
      ? document.body
      : result.container;
  if (proof.within)
    target = within(target).getByRole(proof.within.role, { name: proof.within.name });
  if (proof.scope === "account-fact") {
    const label = screen.getByRole("region", { name: "Find an account" }).querySelectorAll("dt");
    const term = Array.from(label).find((item) => item.textContent === proof.scopeText);
    expect(term).toBeDefined();
    target = term?.parentElement as HTMLElement;
  }

  if (proof.scopeHeading) {
    const heading = within(target).getByRole("heading", { name: proof.scopeHeading });
    target = heading.parentElement as HTMLElement;
  }

  if (proof.scope === "account") target = screen.getByRole("region", { name: "Find an account" });
  if (proof.scope === "dialog") target = screen.getByRole("dialog");
  if (proof.scope === "mail")
    target = screen.getByRole("region", { name: "Instance email settings" });
  if (proof.scope === "audit")
    target = screen.getByRole("table", { name: "Instance administrator activity" });

  if (proof.scope === "schedule")
    target = screen.getByRole("table", { name: "Recorded schedule counters" });
  if (proof.scope === "worker") target = screen.getByRole("region", { name: "Worker" });
  if (proof.scope === "provider") target = screen.getByRole("region", { name: "Data sources" });

  if (proof.scope === "failure" || proof.scope === "fallback") {
    const heading = screen.getByRole("heading", {
      name: proof.scope === "failure" ? "Failures (24h)" : "Fallbacks (24h)",
    });
    target = heading.parentElement as HTMLElement;
  }
  await waitFor(() => {
    const portal =
      interaction.includes("focus-worker") ||
      interaction.includes("email-help") ||
      interaction.includes("recovery-help") ||
      interaction.includes("budget-help")
        ? document.querySelector<HTMLElement>("[data-ui-tooltip]")
        : null;
    if (
      interaction.includes("focus-worker") ||
      interaction.includes("email-help") ||
      interaction.includes("recovery-help") ||
      interaction.includes("budget-help")
    )
      expect(portal).not.toBeNull();
    const query = within(portal ?? target);
    if (proof.fieldValue) {
      const label = query.getByText(proof.text ?? "");
      expect(
        label.tagName === "DT" ? label.nextElementSibling : label.parentElement,
      ).toHaveTextContent(proof.fieldValue);
    }
    if (proof.dateTime) {
      expect(query.getByText(proof.text ?? "")).toHaveAttribute("datetime", proof.dateTime);
    }
    if (proof.title) {
      expect(query.getAllByTitle(proof.title).length).toBeGreaterThan(0);
    } else if (proof.absent && proof.role) {
      expect(query.queryByRole(proof.role, { name: proof.name })).not.toBeInTheDocument();
    } else if (proof.label) {
      expect(query.getAllByLabelText(proof.label).length).toBeGreaterThan(0);
    } else if (proof.role) {
      const elements = query.getAllByRole(proof.role, {
        name:
          proof.exact === false && proof.name
            ? (name) => name.includes(proof.name ?? "")
            : proof.name,
      });
      const element = (
        proof.text
          ? elements.find((node) => node.textContent?.includes(proof.text ?? ""))
          : elements[0]
      ) as HTMLElement;
      expect(element).toBeInTheDocument();
      if (proof.text) expect(element).toHaveTextContent(proof.text);
      if (proof.tagName) expect(element.tagName).toBe(proof.tagName);
      if (proof.href) expect(element).toHaveAttribute("href", proof.href);
      if (proof.disabled) expect(element).toBeDisabled();
      if (proof.value) expect(element).toHaveValue(proof.value);
      if (proof.busyContent)
        expect(result.container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      if (proof.auditLoading)
        expect(
          result.container.querySelector('main [aria-busy="true"][aria-hidden="true"]'),
        ).toBeInTheDocument();
    } else if (proof.text)
      expect(query.getAllByText(proof.text, { exact: proof.exact ?? true }).length).toBeGreaterThan(
        0,
      );
    else throw new Error("Proof needs a role or text");
  });
  if (interaction.includes("account-copy")) {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    fireEvent.click(screen.getByRole("button", { name: "Copy ID" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("user-1"));
  }

  if (interaction.includes("copy-project")) {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    fireEvent.click(within(target).getByRole("button", { name: "Copy project ID" }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        proof.scope === "failure" ? "failure-project" : "fallback-project",
      ),
    );
  }
}
