import { composerFixture } from "@/lib/model-playground/composer-fixtures.test-support";
import { createFakeModelPlaygroundLaunchService } from "@/lib/model-playground/launch-service.fake.test-support";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useModelPlayground } from "./useModelPlayground";

function setup(unsupportedSearch = false) {
  const fixture = composerFixture();
  if (unsupportedSearch) fixture.input.columns = [fixture.input.columns[1]];
  const service = createFakeModelPlaygroundLaunchService(fixture);
  const launch = vi.spyOn(service, "launch");
  const preview = vi.spyOn(service, "preview");
  const mount = () =>
    renderHook(() => useModelPlayground({ ...fixture, service, canRun: true, debounceMs: 1 }));
  return { ...mount(), launch, preview, mount };
}

it.each(["market", "search"])(
  "requires confirmation after a %s edit that changes no sent column",
  async (kind) => {
    const h = setup(kind === "search");
    h.launch.mockRejectedValueOnce(new Error("Response lost"));
    await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
    const sent = JSON.stringify(h.preview.mock.lastCall?.[0].input);
    await act(() => h.result.current.run());
    act(() => {
      if (kind === "market") h.result.current.setMarket("PL");
      else h.result.current.setSearch(true);
    });
    await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
    expect(JSON.stringify(h.preview.mock.lastCall?.[0].input)).toBe(sent);
    await act(() => h.result.current.run());
    expect(h.result.current.confirmationOpen).toBe(true);
    expect(h.launch).toHaveBeenCalledOnce();
  },
);

it.each(["market", "search"])(
  "launches normally when a %s edit changes sent column settings",
  async (kind) => {
    const h = setup();
    if (kind === "market") act(() => h.result.current.setSearch(true));
    h.launch.mockRejectedValueOnce(new Error("Response lost"));
    await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
    const sent = JSON.stringify(h.preview.mock.lastCall?.[0].input);
    await act(() => h.result.current.run());
    act(() => {
      if (kind === "market") h.result.current.setMarket("PL");
      else h.result.current.setSearch(true);
    });
    await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
    expect(JSON.stringify(h.preview.mock.lastCall?.[0].input)).not.toBe(sent);
    await act(() => h.result.current.run());
    expect(h.result.current.confirmationOpen).toBe(false);
    expect(h.launch).toHaveBeenCalledTimes(2);
  },
);

it("clears uncertainty after a confirmed rerun succeeds and fences the completed revision", async () => {
  const h = setup();
  h.launch.mockRejectedValueOnce(new Error("Response lost"));
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  await act(() => h.result.current.run());
  await act(() => h.result.current.run());
  expect(h.result.current.confirmationOpen).toBe(true);
  await act(() => h.result.current.confirmRetry());
  expect(h.result.current.result).not.toBeNull();
  await waitFor(() => expect(h.result.current.quote).not.toBeNull());
  expect(h.result.current.canLaunch).toBe(false);
  expect(h.result.current.confirmationOpen).toBe(false);
  await act(() => h.result.current.run());
  expect(h.result.current.confirmationOpen).toBe(false);
  expect(h.launch).toHaveBeenCalledTimes(2);
});

it("drops the in-memory uncertainty fence on remount with the identical draft", async () => {
  const h = setup();
  h.launch.mockRejectedValueOnce(new Error("Response lost"));
  await waitFor(() => expect(h.result.current.canLaunch).toBe(true));
  const sent = JSON.stringify(h.preview.mock.lastCall?.[0].input);
  await act(() => h.result.current.run());
  await act(() => h.result.current.run());
  expect(h.result.current.confirmationOpen).toBe(true);
  h.unmount();
  const remounted = h.mount();
  await waitFor(() => expect(remounted.result.current.canLaunch).toBe(true));
  expect(JSON.stringify(h.preview.mock.lastCall?.[0].input)).toBe(sent);
  expect(remounted.result.current.confirmationOpen).toBe(false);
  await act(() => remounted.result.current.run());
  expect(h.launch).toHaveBeenCalledTimes(2);
});
