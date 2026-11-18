import { afterEach, expect, it, vi } from "vitest";
import { requestScheduleChangePreview, SchedulePreviewRequestError } from "./preview-client";

afterEach(() => vi.unstubAllGlobals());
const input = { projectId: "project", change: { op: "delete" as const, id: "schedule" } };
it("calls the internal preview action transport and retains structured failures", async () => {
  const failure = {
    ok: false,
    error: { code: "schedule_not_found", message: "Not found", status: 404 },
  };
  const fetchMock = vi.fn(
    async () => new Response(JSON.stringify({ data: failure }), { status: 404 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  expect(await requestScheduleChangePreview(input)).toEqual(failure);
  expect(fetchMock).toHaveBeenCalledWith(
    "/api/check-schedules/preview",
    expect.objectContaining({ method: "POST", body: JSON.stringify(input) }),
  );
});
it("does not expose a transport problem body to the client", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response(JSON.stringify({ detail: "private diagnostics" }), { status: 500 }),
    ),
  );
  await expect(requestScheduleChangePreview(input)).rejects.toBeInstanceOf(
    SchedulePreviewRequestError,
  );
  await expect(requestScheduleChangePreview(input)).rejects.not.toHaveProperty(
    "message",
    "private diagnostics",
  );
});

it("fails closed on a malformed successful preview instead of treating it as no review", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ data: {} }))),
  );
  await expect(requestScheduleChangePreview(input)).rejects.toBeInstanceOf(
    SchedulePreviewRequestError,
  );
});
