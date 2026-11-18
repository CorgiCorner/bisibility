import { renderWithFeatureMessages } from "@/i18n/test-support/render-with-feature-messages";
import { input } from "@/lib/model-playground/contract-fixtures.test-support";
import ai from "@/messages/core/en/project-ai-research.json";
import shared from "@/messages/core/en/shared.json";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";

vi.mock("@/lib/actions/model-playground-track", () => ({ trackModelPlaygroundAction: vi.fn() }));

import { ModelPlaygroundTrackDialog } from "./ModelPlaygroundTrackDialog";

it("discloses future support and submits only the persisted run once", async () => {
  let finish!: (value: { ok: true; promptId: string; presetId: string; reused: boolean }) => void;
  const save = vi.fn(
    () =>
      new Promise<{ ok: true; promptId: string; presetId: string; reused: boolean }>((resolve) => {
        finish = resolve;
      }),
  );
  renderWithFeatureMessages(
    <ModelPlaygroundTrackDialog
      open
      onClose={vi.fn()}
      input={input()}
      projectId="prj_aaaaaaaaaaaaaaaaaaaaaaaa"
      runId="019a70b2-0000-7000-8000-000000000001"
      topics={[]}
      save={save}
    />,
    { messages: { ...shared, ...ai } },
  );
  expect(screen.getByText(/Nothing is scheduled and no model is called/)).toBeVisible();
  expect(screen.getByText(/Needs future tracking support/)).toBeVisible();
  const button = screen.getByRole("button", { name: "Save manual preset" });
  await userEvent.dblClick(button);
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenCalledWith({
    projectRef: "prj_aaaaaaaaaaaaaaaaaaaaaaaa",
    runId: "019a70b2-0000-7000-8000-000000000001",
    topicId: null,
  });
  finish({ ok: true, promptId: "aip_aaaaaaaaaaaaaaaaaaaaaaaa", presetId: "preset", reused: false });
  expect(await screen.findByRole("link", { name: "Open AI Visibility prompt" })).toHaveAttribute(
    "href",
    expect.stringContaining("prompt=aip_"),
  );
  expect(screen.getByText("Manual preset saved. Nothing is scheduled.")).toBeVisible();
});
it("shows a safe retry on refusal", async () => {
  const save = vi
    .fn()
    .mockResolvedValueOnce({ ok: false, reason: "invalid_topic" })
    .mockResolvedValueOnce({ ok: true, promptId: "aip_aaaaaaaaaaaaaaaaaaaaaaaa" });
  renderWithFeatureMessages(
    <ModelPlaygroundTrackDialog
      open
      onClose={vi.fn()}
      input={input()}
      projectId="prj_aaaaaaaaaaaaaaaaaaaaaaaa"
      runId="019a70b2-0000-7000-8000-000000000001"
      topics={[]}
      save={save}
    />,
    { messages: { ...shared, ...ai } },
  );
  await userEvent.click(screen.getByRole("button", { name: "Save manual preset" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Choose an available topic");
  await userEvent.click(screen.getByRole("button", { name: "Save manual preset" }));
  expect(await screen.findByRole("link", { name: "Open AI Visibility prompt" })).toBeVisible();
});

it("explains a typed capacity refusal without suggesting a storage retry", async () => {
  const save = vi.fn().mockResolvedValue({ ok: false, reason: "capacity" });
  renderWithFeatureMessages(
    <ModelPlaygroundTrackDialog
      open
      onClose={vi.fn()}
      input={input()}
      projectId="prj_aaaaaaaaaaaaaaaaaaaaaaaa"
      runId="019a70b2-0000-7000-8000-000000000001"
      topics={[]}
      save={save}
    />,
    { messages: { ...shared, ...ai } },
  );
  await userEvent.click(screen.getByRole("button", { name: "Save manual preset" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Free capacity in AI Visibility");
  expect(screen.queryByText(/could not be saved. Try again/)).toBeNull();
  expect(save).toHaveBeenCalledOnce();
});
