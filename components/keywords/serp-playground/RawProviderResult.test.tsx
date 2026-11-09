import { renderWithProjectRankTrackerMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const read = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/serp-playground", () => ({ getSerpPlaygroundRawAction: read }));

import { RawProviderResult } from "./RawProviderResult";

beforeEach(() => vi.clearAllMocks());
it("loads native JSON on demand without starting a provider search", async () => {
  read.mockResolvedValue({
    ok: true,
    response: { status_code: 20000, items: [{ title: "Native response" }] },
  });
  render(<RawProviderResult projectRef="prj_test" runId="run" provider="dataforseo" />);
  expect(await screen.findByText(/Native response/)).toBeVisible();
  expect(read).toHaveBeenCalledWith({
    projectRef: "prj_test",
    runId: "run",
    provider: "dataforseo",
  });
});
it("distinguishes an older normalized result from a retained native response", async () => {
  read.mockResolvedValue({ ok: true, response: null });
  render(<RawProviderResult projectRef="prj_test" runId="run" provider="dataforseo" />);
  expect(await screen.findByText("Provider response not saved")).toBeVisible();
});
it("does not display a payload when access fails", async () => {
  read.mockResolvedValue({ ok: false });
  render(<RawProviderResult projectRef="prj_test" runId="run" provider="dataforseo" />);
  expect(await screen.findByText("Provider response unavailable")).toBeVisible();
});
