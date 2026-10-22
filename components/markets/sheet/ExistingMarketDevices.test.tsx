import { renderWithProjectMarketsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ExistingMarketDevices } from "./ExistingMarketDevices";

const projectId = `prj_${"a".repeat(24)}`,
  marketId = `pmkt_${"b".repeat(24)}`,
  scheduleId = `sch_${"c".repeat(24)}`;
const actions = { preview: vi.fn(), add: vi.fn() };
const onAdded = vi.fn();
const review = {
  outcome: "ready",
  fingerprint: "a".repeat(64),
  keywordCount: 5,
  newCheckCount: 3,
  existingCount: 1,
  archivedCount: 1,
  scheduleName: null,
};
function mount() {
  return render(
    <ExistingMarketDevices
      projectId={projectId}
      marketId={marketId}
      actions={actions}
      schedules={[{ id: scheduleId, name: "Weekly main", frequency: "weekly" }]}
      onAdded={onAdded}
    />,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  actions.preview.mockResolvedValue(review);
  actions.add.mockResolvedValue({ outcome: "created", created: 3 });
});
it("opens without a request or auto-assignment; previews server scope before explicit Manual confirmation", async () => {
  mount();
  expect(screen.getByText("Free to add. Checks won’t run yet.")).toBeVisible();
  expect(actions.preview).not.toHaveBeenCalled();
  expect(actions.add).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Schedule" })).toHaveTextContent("Manual");
  expect(screen.queryByRole("button", { name: /Add Mobile tracking/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  const confirm = await screen.findByRole("button", { name: "Add Mobile tracking (3)" });
  expect(actions.preview).toHaveBeenCalledWith({
    projectId,
    marketId,
    device: "mobile",
    scheduleId: null,
  });
  expect(screen.getByText("Mobile tracking for 3 keywords.")).toBeVisible();
  expect(actions.add).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  await screen.findByText("Added tracking for 3 keywords.");
  expect(actions.add).toHaveBeenCalledWith({
    projectId,
    marketId,
    device: "mobile",
    scheduleId: null,
    fingerprint: review.fingerprint,
  });
  expect(onAdded).toHaveBeenCalledOnce();
});
it("invalidates the old review when the real schedule selection changes", async () => {
  const user = userEvent.setup();
  mount();
  await user.click(screen.getByRole("button", { name: "Review changes" }));
  await screen.findByRole("button", { name: "Add Mobile tracking (3)" });
  await user.click(screen.getByRole("button", { name: "Schedule" }));
  await user.click(screen.getByRole("menuitem", { name: "Weekly main" }));
  expect(screen.queryByRole("button", { name: /Add Mobile tracking/ })).toBeNull();
  expect(screen.getByText(/Checks follow the selected schedule/)).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Review changes" }));
  await waitFor(() =>
    expect(actions.preview).toHaveBeenLastCalledWith({
      projectId,
      marketId,
      device: "mobile",
      scheduleId,
    }),
  );
  expect(actions.add).not.toHaveBeenCalled();
});
it("shows changed scope and requires another review without silently retrying or adding", async () => {
  actions.add.mockResolvedValue({ outcome: "unavailable", reason: "selection_changed" });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  fireEvent.click(await screen.findByRole("button", { name: "Add Mobile tracking (3)" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("The keywords or schedule changed");
  expect(screen.queryByRole("button", { name: /Add Mobile tracking/ })).toBeNull();
  expect(actions.add).toHaveBeenCalledOnce();
  expect(onAdded).not.toHaveBeenCalled();
});
it("offers no confirmation when every variant already exists", async () => {
  actions.preview.mockResolvedValue({ ...review, newCheckCount: 0 });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  await screen.findByText("Mobile tracking for 0 keywords.");
  expect(screen.queryByRole("button", { name: /Add Mobile tracking/ })).toBeNull();
  expect(actions.add).not.toHaveBeenCalled();
});

it("explains conflicting tracking settings without offering an arbitrary target URL or Add action", async () => {
  actions.preview.mockResolvedValue({ outcome: "unavailable", reason: "ambiguous_keywords" });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Matching keywords use different tracking settings. Use Add keywords",
  );
  expect(screen.queryByRole("button", { name: /Add Mobile tracking/ })).toBeNull();
  expect(actions.add).not.toHaveBeenCalled();
});

it("omits skipped counts when every selected keyword can be added", async () => {
  actions.preview.mockResolvedValue({ ...review, existingCount: 0, archivedCount: 0 });
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  expect(await screen.findByText("Mobile tracking for 3 keywords.")).toBeVisible();
  expect(screen.queryByText(/Skipped:/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Unique keywords|full-market/)).not.toBeInTheDocument();
});

it("adds only explicitly selected keywords and never treats an empty selection as all", async () => {
  const firstId = `kw_${"a".repeat(24)}`;
  const secondId = `kw_${"b".repeat(24)}`;
  actions.preview.mockImplementation(async (input) => ({
    ...review,
    newCheckCount: input.keywordIds.length,
  }));
  render(
    <ExistingMarketDevices
      projectId={projectId}
      marketId={marketId}
      actions={actions}
      schedules={[]}
      candidates={[
        { id: firstId, keyword: "alpha", existingDevices: ["desktop"] },
        { id: secondId, keyword: "beta", existingDevices: ["desktop"] },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
  expect(screen.getByRole("button", { name: "Review changes" })).toBeDisabled();
  expect(actions.preview).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: "beta" }));
  fireEvent.click(screen.getByRole("button", { name: "Review changes" }));
  const add = await screen.findByRole("button", { name: "Add Mobile tracking (1)" });
  expect(actions.preview).toHaveBeenCalledWith({
    projectId,
    marketId,
    device: "mobile",
    scheduleId: null,
    keywordIds: [secondId],
  });
  fireEvent.click(add);
  await waitFor(() =>
    expect(actions.add).toHaveBeenCalledWith(expect.objectContaining({ keywordIds: [secondId] })),
  );
});
