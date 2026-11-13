import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import workspace from "@/messages/core/en/agent-workspace.json";
import challenge from "@/messages/core/en/challenge-report.json";
import shared from "@/messages/core/en/shared.json";
import { deferred } from "@/tests/deferred";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import { ChallengeReportDialog } from "./ChallengeReportDialog";

const projectId = "prj_abcdefghijklmnopqrstuvwx";
const reportId = "agr_abcdefghijklmnopqrstuvwx";
const props = {
  defaultStart: "2026-01-01",
  domain: "example.com",
  projectId,
  saveAction: vi.fn(),
  today: "2026-02-15",
};
const messages = { ...shared, ...challenge, ...workspace };

beforeEach(() => vi.clearAllMocks());

it("defaults to the snapshot dates and offers a single dialog for both report types", async () => {
  renderWithFeatureMessages(<ChallengeReportDialog {...props} createAction={vi.fn()} />, {
    messages,
  });
  await userEvent.click(screen.getByRole("button", { name: "New report" }));
  expect(screen.getByRole("button", { name: /^Generate a performance report/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByLabelText("Start date")).toHaveValue("2026-01-01");
  expect(screen.getByLabelText("End date")).toHaveValue("2026-02-15");
  await userEvent.click(screen.getByRole("button", { name: "Length" }));
  await userEvent.click(screen.getByRole("menuitem", { name: "30 days" }));
  expect(screen.getByLabelText("Start date")).toHaveValue("2026-01-17");
  await userEvent.click(screen.getByRole("button", { name: /^Write or paste a report/ }));
  expect(screen.getByLabelText("Report content")).toBeInTheDocument();
  expect(screen.getAllByRole("dialog")).toHaveLength(1);
});

it("blocks duplicate submissions during persistence and while the report route opens", async () => {
  const pending = deferred<{ id: string; ok: true }>();
  const createAction = vi.fn(() => pending.promise);
  renderWithFeatureMessages(
    <ChallengeReportDialog {...props} initialOpen createAction={createAction} />,
    { messages },
  );
  const create = screen.getByRole("button", { name: "Create report" });
  fireEvent.click(create);
  fireEvent.click(create);
  await waitFor(() => expect(createAction).toHaveBeenCalledOnce());
  expect(create).toBeDisabled();
  expect(create).toHaveTextContent("Creating report");
  pending.resolve({ id: reportId, ok: true });
  await waitFor(() =>
    expect(routerMock.push).toHaveBeenCalledWith(`/app/${projectId}/agent-reports/${reportId}`),
  );
  expect(create).toBeDisabled();
});

it("reuses a failed submission key only if the report values have not changed", async () => {
  const user = userEvent.setup();
  const createAction = vi.fn().mockResolvedValue({ code: "invalid", ok: false });
  renderWithFeatureMessages(
    <ChallengeReportDialog {...props} initialOpen createAction={createAction} />,
    { messages },
  );
  const create = screen.getByRole("button", { name: "Create report" });
  await user.click(create);
  await waitFor(() => expect(createAction).toHaveBeenCalledTimes(1));
  await user.click(create);
  await waitFor(() => expect(createAction).toHaveBeenCalledTimes(2));
  expect(createAction.mock.calls[1]?.[0].requestId).toBe(createAction.mock.calls[0]?.[0].requestId);

  const title = screen.getByLabelText("Report title");
  await user.clear(title);
  await user.type(title, "Updated report");
  await user.click(create);
  await waitFor(() => expect(createAction).toHaveBeenCalledTimes(3));
  expect(createAction.mock.calls[2]?.[0]).toMatchObject({ title: "Updated report" });
  expect(createAction.mock.calls[2]?.[0].requestId).not.toBe(
    createAction.mock.calls[0]?.[0].requestId,
  );
});
