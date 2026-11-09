import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ preview: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/actions/serp-playground", () => ({
  previewSerpPlaygroundSaveAction: api.preview,
  saveSerpPlaygroundAction: api.save,
}));

import { SavePlaygroundResult } from "./SavePlaygroundResult";

beforeEach(() => {
  vi.clearAllMocks();
  api.preview.mockResolvedValue({
    ok: true,
    match: {
      keywordRef: "kw_x",
      keyword: "Coffee",
      location: "United States",
      language: "en",
      device: "desktop",
      provider: "dataforseo",
      date: "2026-11-03T10:00:00Z",
    },
  });
  api.save.mockResolvedValue({ ok: true, checkRef: "check_x", keywordRef: "kw_x" });
});
it("shows matching settings and waits for explicit confirmation before saving", async () => {
  render(<SavePlaygroundResult projectRef="prj_x" runId="run" provider="dataforseo" />);
  fireEvent.click(screen.getByRole("button", { name: "Save to keyword" }));
  expect(await screen.findByRole("dialog")).toHaveTextContent("Coffee");
  expect(screen.getByRole("dialog")).toHaveTextContent("United States");
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Save result" }));
  await waitFor(() =>
    expect(api.save).toHaveBeenCalledWith({
      projectRef: "prj_x",
      runId: "run",
      provider: "dataforseo",
    }),
  );
  expect(await screen.findByRole("button", { name: "Saved" })).toBeDisabled();
});
it("cancel and mismatch never write to keyword history", async () => {
  const ui = render(<SavePlaygroundResult projectRef="prj_x" runId="run" provider="serpapi" />);
  fireEvent.click(screen.getByRole("button", { name: "Save to keyword" }));
  await screen.findByRole("dialog");
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(api.save).not.toHaveBeenCalled();
  ui.unmount();
  api.preview.mockResolvedValue({ ok: false });
  render(<SavePlaygroundResult projectRef="prj_x" runId="run2" provider="serpapi" />);
  fireEvent.click(screen.getByRole("button", { name: "Save to keyword" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(api.save).not.toHaveBeenCalled();
});
