import { renderWithInstanceAdminMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { recoveryViewFixture } from "@/lib/metering/recovery/view-fixture";
import { fireEvent, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { OssAdministration } from "./OssAdministration";
import { OssAudit } from "./OssAudit";
import { OssRecovery } from "./OssRecovery";
import checklist from "./oss-capabilities.json";

const coveredIds: string[] = [];
function capabilityTest(ids: string[], name: string, run: () => void | Promise<void>) {
  coveredIds.push(...ids);
  it(`${ids.join(" ")} ${name}`, run);
}

capabilityTest(
  ["R003", "R016", "R026", "R027", "R028"],
  "invoke recovery controls with their payloads",
  () => {
    const refresh = vi.fn();
    const retry = vi.fn();
    const page = vi.fn();
    render(
      <OssRecovery
        page={{ ...recoveryViewFixture(), nextCursor: "older" }}
        command={{ commandId: "sample", state: "completed", outcomes: [] }}
        commandError="Command status is unavailable."
        onRefresh={refresh}
        onRetryCommand={retry}
        onPage={page}
        onPreview={vi.fn()}
        onConfirm={vi.fn()}
        onSaveTriage={vi.fn()}
        onFilterChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Refresh cases" })[0]);
    expect(refresh).toHaveBeenCalledTimes(1);
    fireEvent.click(
      within(screen.getByText("Command: completed").parentElement as HTMLElement).getByRole(
        "button",
        { name: "Refresh cases" },
      ),
    );
    expect(refresh).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Retry command status" }));
    expect(retry).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(page).toHaveBeenLastCalledWith("older", { category: "all", provider: "all" });
    fireEvent.click(screen.getByRole("button", { name: "First page" }));
    expect(page).toHaveBeenLastCalledWith(undefined, { category: "all", provider: "all" });
  },
);

capabilityTest(["R030"], "retries unavailable recovery", () => {
  const refresh = vi.fn();
  render(
    <OssRecovery
      page={null}
      onRefresh={refresh}
      onRetryCommand={vi.fn()}
      onPage={vi.fn()}
      onPreview={vi.fn()}
      onConfirm={vi.fn()}
      onSaveTriage={vi.fn()}
      onFilterChange={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(refresh).toHaveBeenCalledOnce();
});

capabilityTest(["T021"], "requests the exact audit cursor", () => {
  const next = vi.fn();
  render(<OssAudit entries={[]} nextCursor="audit-cursor" onNext={next} />);
  fireEvent.click(screen.getByRole("button", { name: "Older entries" }));
  expect(next).toHaveBeenCalledWith("audit-cursor");
});

capabilityTest(["A086"], "reveals credential fields for replacement", () => {
  render(
    <OssAdministration
      account={null}
      onLookup={vi.fn()}
      onAccountAction={vi.fn()}
      onSaveMail={vi.fn()}
      onClearMail={vi.fn()}
      mailSettings={{
        credentialsConfigured: true,
        envOverridesSaved: true,
        hasPasswordCredential: true,
        provider: "smtp",
        sender: "Admin <admin@example.com>",
        twoFactorEnabled: true,
      }}
    />,
  );
  expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Replace credentials" }));
  expect(screen.getByLabelText("Password")).toBeVisible();
  expect(screen.getByLabelText("Host")).toBeVisible();
});

it("links the required control behaviors to the audited checklist", () => {
  const expected = ["R003", "R016", "R026", "R027", "R028", "R030", "T021", "A086"].sort();
  expect([...coveredIds].sort()).toEqual(expected);
  expect(
    checklist
      .filter((entry) => coveredIds.includes(entry.id))
      .map((entry) => entry.id)
      .sort(),
  ).toEqual(expected);
});
