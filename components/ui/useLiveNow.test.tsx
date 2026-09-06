import { FROZEN_NOW, FROZEN_NOW_ISO } from "@/tests/clock";
import { render } from "@testing-library/react";
import { act, useCallback, useSyncExternalStore } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { useLiveNow } from "./useLiveNow";

const SERVER_NOW = FROZEN_NOW_ISO;

function useUncachedLiveNow(serverNow: string, active: boolean): string {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (!active) return () => {};
      const interval = window.setInterval(onStoreChange, 1_000);
      return () => window.clearInterval(interval);
    },
    [active],
  );
  const getServerSnapshot = useCallback(() => serverNow, [serverNow]);
  const getSnapshot = useCallback(() => new Date().toISOString(), []);

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function uniqueIsoReads() {
  const toISOString = Date.prototype.toISOString;
  let reads = 0;

  return vi.spyOn(Date.prototype, "toISOString").mockImplementation(function (this: Date) {
    return toISOString.call(new Date(this.getTime() + reads++));
  });
}

describe("useLiveNow", () => {
  it("renders each active consumer once in a commit and shares one clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    const isoReads = uniqueIsoReads();
    const firstRender = vi.fn();
    const secondRender = vi.fn();

    function Probe({ onRender }: Readonly<{ onRender: () => void }>) {
      onRender();
      useLiveNow(SERVER_NOW, true);
      return null;
    }

    try {
      const view = render(
        <>
          <Probe onRender={firstRender} />
          <Probe onRender={secondRender} />
        </>,
      );

      expect(firstRender).toHaveBeenCalledTimes(1);
      expect(secondRender).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(1);

      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      isoReads.mockRestore();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("updates the ISO value once after one second", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    const values: string[] = [];

    function Probe() {
      const now = useLiveNow(SERVER_NOW, true);
      values.push(now);
      return null;
    }

    try {
      const view = render(<Probe />);
      expect(values).toEqual([SERVER_NOW]);

      act(() => vi.advanceTimersByTime(1_000));

      expect(values).toEqual([SERVER_NOW, new Date(FROZEN_NOW.getTime() + 1_000).toISOString()]);
      view.unmount();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("does not tick while inactive", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    const values: string[] = [];

    function Probe() {
      const now = useLiveNow(SERVER_NOW, false);
      values.push(now);
      return null;
    }

    try {
      const view = render(<Probe />);
      expect(values).toEqual([SERVER_NOW]);
      expect(vi.getTimerCount()).toBe(0);

      act(() => vi.advanceTimersByTime(5_000));

      expect(values).toEqual([SERVER_NOW]);
      view.unmount();
    } finally {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it("returns serverNow during SSR", () => {
    function Probe() {
      return <output>{useLiveNow(SERVER_NOW, true)}</output>;
    }

    expect(renderToStaticMarkup(<Probe />)).toBe(`<output>${SERVER_NOW}</output>`);
  });

  it.fails("exposes the original uncached Date snapshot loop", () => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_NOW);
    const isoReads = uniqueIsoReads();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const renderCount = vi.fn();

    function LegacyProbe() {
      renderCount();
      useUncachedLiveNow(SERVER_NOW, true);
      return null;
    }

    try {
      render(<LegacyProbe />);
      expect(renderCount).toHaveBeenCalledTimes(1);
    } finally {
      consoleError.mockRestore();
      isoReads.mockRestore();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
