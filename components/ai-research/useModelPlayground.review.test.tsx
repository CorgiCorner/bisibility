import { composerFixture } from "@/lib/model-playground/composer-fixtures.test-support";
import { previousRunCause } from "@/lib/model-playground/composer-revision";
import { createFakeModelPlaygroundLaunchService } from "@/lib/model-playground/launch-service.fake.test-support";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { composerCopy } from "./model-playground-composer-copy.test-support";
import { useModelPlayground } from "./useModelPlayground";

afterEach(() => vi.useRealTimers());
function setup(prompt?: string) {
  const fixture = composerFixture();
  if (prompt) fixture.input.prompt = prompt;
  const service = createFakeModelPlaygroundLaunchService(fixture);
  const preview = vi.spyOn(service, "preview");
  const launch = vi.spyOn(service, "launch");
  const hook = renderHook(() =>
    useModelPlayground({ ...fixture, service, canRun: true, debounceMs: 1 }),
  );
  return { ...hook, fixture, service, preview, launch };
}

it("previews the parsed prompt and binds launch to that exact input and revision", async () => {
  const h = setup("  Compare tools  ");
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  expect(h.preview.mock.lastCall?.[0].input.prompt).toBe("Compare tools");
  const quote = h.result.current.quote;
  await act(() => h.result.current.run());
  expect(h.launch).toHaveBeenCalledOnce();
  expect(h.launch.mock.lastCall?.[0]).toMatchObject({
    revision: quote?.revision,
    previewId: quote?.previewId,
    configHash: quote?.configHash,
  });
  expect(h.launch.mock.lastCall?.[0].requestId).toMatch(/^[a-f0-9-]{36}$/);
});

it("fences identical parsed content after an uncertain launch despite a whitespace edit", async () => {
  const h = setup();
  h.launch.mockRejectedValue(new Error("Response lost"));
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  const input = h.result.current.input;
  await act(() => h.result.current.run());
  expect(h.result.current.failed).toBe(true);
  expect(h.result.current.input).toEqual(input);
  await act(() => h.result.current.run());
  expect(h.launch).toHaveBeenCalledOnce();
  act(() => h.result.current.form.setValue("prompt", `${input.prompt} `));
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  await act(() => h.result.current.run());
  expect(h.launch).toHaveBeenCalledOnce();
  expect(h.preview.mock.lastCall?.[0].input).toEqual(input);
  expect(h.result.current.confirmationOpen).toBe(true);
  act(() => h.result.current.cancelRetry());
  await act(() => h.result.current.confirmRetry());
  expect(h.launch).toHaveBeenCalledOnce();
  await act(() => h.result.current.run());
  const confirm = h.result.current.confirmRetry;
  await act(() => Promise.all([confirm(), confirm()]));
  expect(h.launch).toHaveBeenCalledTimes(2);
  expect(h.launch.mock.calls[1][0].requestId).not.toBe(h.launch.mock.calls[0][0].requestId);
});

it("launches changed content normally but fences a return to the uncertain content", async () => {
  const h = setup();
  h.launch.mockRejectedValueOnce(new Error("Response lost"));
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  const original = h.result.current.input.prompt;
  await act(() => h.result.current.run());
  act(() => h.result.current.form.setValue("prompt", "A different question"));
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  await act(() => h.result.current.run());
  expect(h.launch).toHaveBeenCalledTimes(2);
  expect(h.result.current.confirmationOpen).toBe(false);
  act(() => h.result.current.form.setValue("prompt", original));
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  await act(() => h.result.current.run());
  expect(h.launch).toHaveBeenCalledTimes(2);
  expect(h.result.current.confirmationOpen).toBe(true);
  const staleConfirm = h.result.current.confirmRetry;
  act(() => h.result.current.setMarket("PL"));
  await act(staleConfirm);
  expect(h.launch).toHaveBeenCalledTimes(2);
});

it.each(["catalog", "connection"])(
  "keeps identical launched content current after a %s refresh",
  async (kind) => {
    const h = setup();
    await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
    await act(() => h.result.current.run());
    const before = h.result.current.resultDraft;
    if (!before) throw new Error("Expected launched draft");
    if (kind === "catalog")
      h.fixture.catalogs[0].fetchedAt = new Date(Date.now() - 1000).toISOString();
    else
      h.fixture.connections[0] = { ...h.fixture.connections[0], name: "Updated connection label" };
    h.rerender();
    expect(h.result.current.draft.revision).not.toBe(before.revision);
    expect(previousRunCause(before, h.result.current.draft, composerCopy)).toBeUndefined();
  },
);

it.each(["catalog", "connection"])(
  "keeps uncertain content fenced after a %s refresh",
  async (kind) => {
    const h = setup();
    h.launch.mockRejectedValueOnce(new Error("Response lost"));
    await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
    await act(() => h.result.current.run());
    if (kind === "catalog")
      h.fixture.catalogs[0].fetchedAt = new Date(Date.now() - 1000).toISOString();
    else h.fixture.connections[0] = { ...h.fixture.connections[0], name: "Refreshed label" };
    h.rerender();
    await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
    await act(() => h.result.current.run());
    expect(h.launch).toHaveBeenCalledOnce();
    expect(h.result.current.confirmationOpen).toBe(true);
  },
);

it("re-evaluates an idle catalog at expiry and blocks launch", async () => {
  vi.useFakeTimers();
  const h = setup();
  h.fixture.catalogs[0].expiresAt = new Date(Date.now() + 1000).toISOString();
  h.rerender();
  await act(() => vi.advanceTimersByTimeAsync(10));
  expect(h.result.current.canLaunch).toBe(true);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(h.result.current.canLaunch).toBe(false);
  expect(h.result.current.issues).not.toHaveLength(0);
  await act(() => h.result.current.run());
  expect(h.launch).not.toHaveBeenCalled();
});

it("refuses a previous closure after the parsed input changes before a new quote", async () => {
  const h = setup();
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  const staleRun = h.result.current.run;
  await act(async () => {
    h.result.current.form.setValue("prompt", "Different input");
    await staleRun();
  });
  expect(h.launch).not.toHaveBeenCalled();
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  await act(() => h.result.current.run());
  expect(h.launch).toHaveBeenCalledOnce();
});

it("refuses a previous Run closure after its connection is disabled", async () => {
  const h = setup();
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  const staleRun = h.result.current.run;
  h.fixture.connections = h.fixture.connections.map((connection, index) =>
    index ? connection : { ...connection, enabled: false },
  );
  h.rerender();
  expect(h.result.current.canLaunch).toBe(false);
  await act(staleRun);
  expect(h.launch).not.toHaveBeenCalled();
});
