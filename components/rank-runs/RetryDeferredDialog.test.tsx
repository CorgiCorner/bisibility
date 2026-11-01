import { renderWithProjectRunsMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RetryDeferredDialog } from "./RetryDeferredDialog";

afterEach(() => vi.unstubAllGlobals());
it("loads every deferred target before allowing an explicit paid retry", async () => {
  const confirm = vi.fn();
  const target = (id: string) => ({ id, keyword: { text: id, location: "US", device: "desktop" } });
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [target("alpha")], meta: { next_cursor: "next" } }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [target("beta")], meta: { next_cursor: null } }),
    });
  vi.stubGlobal("fetch", fetch);
  render(
    <RetryDeferredDialog
      open
      busy={false}
      projectRef="prj_example"
      runId="rcr_example"
      onClose={vi.fn()}
      onConfirm={confirm}
    />,
  );
  expect(screen.getByText(/Each retry is a new paid attempt/)).toBeVisible();
  await waitFor(() => expect(screen.getByText(/beta/)).toBeVisible());
  expect(screen.getByText(/alpha/)).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Retry these checks" }));
  expect(confirm).toHaveBeenCalledTimes(1);
});
it("does not enable confirmation when target loading fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  render(
    <RetryDeferredDialog
      open
      busy={false}
      projectRef="prj_example"
      runId="rcr_example"
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />,
  );
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByRole("button", { name: "Retry these checks" })).toBeDisabled();
});
