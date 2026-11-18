import { result } from "@/lib/model-playground/contract-fixtures.test-support";
import type { ModelPlaygroundLaunchResult } from "@/lib/model-playground/launch-service";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/actions/research-history", () => ({
  readModelPlaygroundRetainedResultAction: mocks.read,
  saveModelPlaygroundReportAction: mocks.save,
}));

import { useModelPlaygroundReport } from "./useModelPlaygroundReport";

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
});
it("waits through pending then automatically saves the later paid answer", async () => {
  vi.useFakeTimers();
  mocks.read
    .mockResolvedValueOnce({ ok: true, terminal: false, columns: [] })
    .mockResolvedValue({ ok: true, terminal: true, columns: [result()] });
  mocks.save.mockResolvedValue({ ok: true, reportId: "report", alreadySaved: false });
  const run = { runId: crypto.randomUUID(), columns: [] };
  const hook = renderHook(() => useModelPlaygroundReport("project", run));
  await act(async () => {
    await Promise.resolve();
  });
  expect(hook.result.current.status).toBe("pending");
  expect(mocks.save).not.toHaveBeenCalled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  expect(hook.result.current.status).toBe("saved");
  expect(hook.result.current.result?.columns[0].answer).toBe(result().answer);
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(mocks.save).toHaveBeenCalledWith({
    projectRef: "project",
    runId: run.runId,
    explicit: false,
  });
});
it.each(["unclassified", "dismissed"] as const)(
  "keeps %s distinct from unavailable and does not hide an explicit save",
  async (reason) => {
    mocks.read.mockResolvedValue({ ok: true, terminal: true, columns: [result()] });
    mocks.save.mockResolvedValue({ ok: false, reason });
    const run = { runId: crypto.randomUUID(), columns: [result()] };
    const hook = renderHook(() => useModelPlaygroundReport("project", run));
    await waitFor(() => expect(hook.result.current.status).toBe(reason));
    expect(mocks.save).toHaveBeenCalledWith({
      projectRef: "project",
      runId: run.runId,
      explicit: false,
    });
    if (reason === "unclassified") {
      mocks.save.mockResolvedValue({ ok: true, reportId: "report", alreadySaved: false });
      await act(() => hook.result.current.save(run.runId));
      expect(mocks.save).toHaveBeenLastCalledWith({
        projectRef: "project",
        runId: run.runId,
        explicit: true,
      });
      expect(hook.result.current.status).toBe("saved");
    }
  },
);
it("keeps explicit intent from unclassified through read_only and Check again", async () => {
  mocks.read.mockResolvedValue({ ok: true, terminal: true, columns: [result()] });
  mocks.save
    .mockResolvedValueOnce({ ok: false, reason: "unclassified" })
    .mockResolvedValueOnce({ ok: false, reason: "read_only" })
    .mockResolvedValueOnce({ ok: true, reportId: "report", alreadySaved: false });
  const run = { runId: crypto.randomUUID(), columns: [result()] };
  const hook = renderHook(() => useModelPlaygroundReport("project", run));
  await waitFor(() => expect(hook.result.current.status).toBe("unclassified"));
  expect(mocks.save).toHaveBeenCalledWith({
    projectRef: "project",
    runId: run.runId,
    explicit: false,
  });
  await act(() => hook.result.current.save(run.runId));
  expect(hook.result.current.status).toBe("read_only");
  expect(mocks.save).toHaveBeenLastCalledWith({
    projectRef: "project",
    runId: run.runId,
    explicit: true,
  });
  await act(() => hook.result.current.checkAgain());
  await waitFor(() => expect(hook.result.current.status).toBe("saved"));
  expect(mocks.save).toHaveBeenLastCalledWith({
    projectRef: "project",
    runId: run.runId,
    explicit: true,
  });
});
it.each(["storage", "forbidden", "too_large", "read_only"])(
  "keeps %s distinct and never retries or removes the answer",
  async (reason) => {
    mocks.read.mockResolvedValue({ ok: true, terminal: true, columns: [result()] });
    mocks.save
      .mockResolvedValueOnce({ ok: false, reason })
      .mockResolvedValue({ ok: true, reportId: "report", alreadySaved: true });
    const run = { runId: crypto.randomUUID(), columns: [result()] };
    const hook = renderHook(() => useModelPlaygroundReport("project", run));
    await waitFor(() => expect(hook.result.current.status).toBe(reason));
    hook.rerender();
    expect(mocks.save).toHaveBeenCalledOnce();
    expect(hook.result.current.result?.columns).toEqual(run.columns);
    if (reason === "storage") {
      await act(() => hook.result.current.save(run.runId));
      expect(hook.result.current.status).toBe("saved");
    }
  },
);
it("does not replace a paid answer with an older empty retained-run read", async () => {
  mocks.read.mockResolvedValue({ ok: true, terminal: false, columns: [] });
  const run = { runId: crypto.randomUUID(), columns: [result()] };
  const hook = renderHook(() => useModelPlaygroundReport("project", run));
  await act(async () => {
    await Promise.resolve();
  });
  expect(hook.result.current.result?.columns).toEqual(run.columns);
});

it.each(["queued", "storage", "thrown", "queued-then-storage", "storage-then-queued"])(
  "bounds %s reads with backoff and allows a manual check",
  async (mode) => {
    vi.useFakeTimers();
    if (mode === "thrown") mocks.read.mockRejectedValue(new Error("Storage unavailable"));
    else
      mocks.read.mockResolvedValue(
        mode.includes("storage")
          ? { ok: false, reason: "storage" }
          : { ok: true, terminal: false, columns: [] },
      );
    if (mode === "queued-then-storage")
      mocks.read.mockResolvedValueOnce({ ok: true, terminal: false, columns: [] });
    if (mode === "storage-then-queued")
      mocks.read
        .mockResolvedValue({ ok: true, terminal: false, columns: [] })
        .mockResolvedValueOnce({ ok: false, reason: "storage" });
    const run = { runId: crypto.randomUUID(), columns: [result()] };
    const hook = renderHook(() => useModelPlaygroundReport("project", run));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.read).toHaveBeenCalledTimes(1);
    for (const [index, delay] of [1500, 3000, 6000, 12000, 24000].entries()) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay - 1);
      });
      expect(mocks.read).toHaveBeenCalledTimes(index + 1);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1);
      });
      expect(mocks.read).toHaveBeenCalledTimes(index + 2);
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3600000);
    });
    expect(mocks.read).toHaveBeenCalledTimes(6);
    expect(hook.result.current.status).toBe(
      mode === "queued" || mode === "storage-then-queued" ? "pending" : "check_failed",
    );
    expect(mocks.save).not.toHaveBeenCalled();
    expect(hook.result.current.result?.columns).toEqual(run.columns);
    mocks.read.mockResolvedValue({ ok: true, terminal: true, columns: [result()] });
    mocks.save.mockResolvedValue({ ok: true, reportId: "saved", alreadySaved: false });
    await act(async () => {
      hook.result.current.checkAgain();
    });
    expect(mocks.read).toHaveBeenCalledTimes(7);
    expect(hook.result.current.status).toBe("saved");
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it("ignores an in-flight read after the run changes and clears polling on unmount", async () => {
  vi.useFakeTimers();
  let finish!: (value: unknown) => void;
  mocks.read
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ ok: true, terminal: false, columns: [] });
  const first: ModelPlaygroundLaunchResult = { runId: crypto.randomUUID(), columns: [] };
  const second: ModelPlaygroundLaunchResult = { runId: crypto.randomUUID(), columns: [result()] };
  const hook = renderHook(({ run }) => useModelPlaygroundReport("project", run), {
    initialProps: { run: first },
  });
  hook.rerender({ run: second });
  await act(async () => {
    finish({ ok: true, terminal: true, columns: [result()] });
  });
  expect(mocks.save).not.toHaveBeenCalled();
  expect(hook.result.current.result?.runId).toBe(second.runId);
  hook.unmount();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60000);
  });
  expect(mocks.read).toHaveBeenCalledTimes(2);
});

it("manually rechecks a read-only run and saves exactly once after the hold lifts", async () => {
  vi.useFakeTimers();
  mocks.read.mockResolvedValue({ ok: true, terminal: true, columns: [result()] });
  mocks.save.mockResolvedValue({ ok: false, reason: "read_only" });
  const run = { runId: crypto.randomUUID(), columns: [result()] };
  const hook = renderHook(() => useModelPlaygroundReport("project", run));
  await act(async () => {
    await Promise.resolve();
  });
  expect(hook.result.current.status).toBe("read_only");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3600000);
  });
  expect(mocks.save).toHaveBeenCalledOnce();
  await act(async () => {
    hook.result.current.checkAgain();
  });
  expect(mocks.save).toHaveBeenCalledTimes(2);
  expect(hook.result.current.status).toBe("read_only");
  expect(hook.result.current.result?.columns).toEqual(run.columns);
  mocks.save.mockResolvedValue({ ok: true, reportId: "report", alreadySaved: false });
  await act(async () => {
    hook.result.current.checkAgain();
  });
  expect(mocks.read).toHaveBeenCalledTimes(3);
  expect(mocks.save).toHaveBeenCalledTimes(3);
  expect(hook.result.current.status).toBe("saved");
  expect(hook.result.current.result?.columns).toEqual(run.columns);
  hook.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it.each([false, true])(
  "schedules one server readyAt read beyond the bounded budget, cancel=%s",
  async (cancel) => {
    vi.useFakeTimers();
    const start = Date.now();
    const readyAt = new Date(start + 150000).toISOString();
    mocks.read
      .mockResolvedValueOnce({ ok: true, terminal: false, readyAt, readyInMs: 150000, columns: [] })
      .mockResolvedValue({ ok: true, terminal: true, columns: [result()] });
    mocks.save.mockResolvedValue({ ok: true, reportId: "report", alreadySaved: false });
    const run = { runId: crypto.randomUUID(), columns: [] };
    const hook = renderHook(() => useModelPlaygroundReport("project", run));
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(149999);
    });
    expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
    if (cancel) hook.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.read).toHaveBeenCalledTimes(cancel ? 1 : 2);
    if (!cancel) {
      expect(hook.result.current.status).toBe("saved");
      expect(mocks.save).toHaveBeenCalledOnce();
      expect(hook.result.current.result?.columns[0].answer).toBe(result().answer);
      hook.unmount();
    }
    expect(vi.getTimerCount()).toBe(0);
  },
);

it.each(["past", "storage", "later"])(
  "a readyAt timer handles %s without an automatic read loop",
  async (mode) => {
    vi.useFakeTimers();
    const first = Date.now() + 150000;
    mocks.read.mockResolvedValueOnce({
      ok: true,
      terminal: false,
      readyAt: new Date(first).toISOString(),
      readyInMs: 150000,
      columns: [],
    });
    if (mode === "storage") mocks.read.mockResolvedValue({ ok: false, reason: "storage" });
    else
      mocks.read.mockResolvedValue({
        ok: true,
        terminal: false,
        readyAt: new Date(first + (mode === "later" ? 150000 : 0)).toISOString(),
        readyInMs: mode === "later" ? 150000 : 0,
        columns: [],
      });
    const hook = renderHook(() =>
      useModelPlaygroundReport("project", { runId: "run", columns: [] }),
    );
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(150000);
    });
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks.save).not.toHaveBeenCalled();
    if (mode === "later") {
      mocks.read.mockResolvedValue({ ok: true, terminal: true, columns: [result()] });
      mocks.save.mockResolvedValue({ ok: true, reportId: "report", alreadySaved: false });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(150000);
      });
      expect(mocks.read).toHaveBeenCalledTimes(3);
      expect(mocks.save).toHaveBeenCalledOnce();
    } else {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3600000);
      });
      expect(mocks.read).toHaveBeenCalledTimes(2);
      expect(hook.result.current.status).toBe(mode === "storage" ? "check_failed" : "pending");
    }
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  },
);

it.each([-3600000, 3600000])(
  "uses server delay with client clock skew %s and allows one future follow-up",
  async (skew) => {
    vi.useFakeTimers();
    const serverNow = Date.now();
    vi.setSystemTime(serverNow + skew);
    const readyAt = new Date(serverNow + 150000).toISOString();
    mocks.read
      .mockResolvedValueOnce({ ok: true, terminal: false, readyAt, readyInMs: 150000, columns: [] })
      .mockResolvedValueOnce({ ok: true, terminal: false, readyAt, readyInMs: 25, columns: [] })
      .mockResolvedValue({
        ok: true,
        terminal: true,
        readyAt: null,
        readyInMs: null,
        columns: [result()],
      });
    mocks.save.mockResolvedValue({ ok: true, reportId: "report", alreadySaved: false });
    const hook = renderHook(() =>
      useModelPlaygroundReport("project", { runId: "run", columns: [] }),
    );
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(149999);
    });
    expect(mocks.read).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.read).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(24);
    });
    expect(mocks.read).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(mocks.read).toHaveBeenCalledTimes(3);
    expect(hook.result.current.status).toBe("saved");
    expect(mocks.save).toHaveBeenCalledOnce();
    hook.unmount();
    expect(vi.getTimerCount()).toBe(0);
  },
);
it("shows a linked report as saved when a held project is opened", async () => {
  mocks.read.mockResolvedValue({ ok: true, terminal: true, columns: [result()] });
  mocks.save.mockResolvedValue({ ok: true, reportId: "agr_linked", alreadySaved: true });
  const run = { runId: crypto.randomUUID(), columns: [result()] };
  const hook = renderHook(() => useModelPlaygroundReport("project", run));
  await waitFor(() => expect(hook.result.current.status).toBe("saved"));
  expect(hook.result.current.reportId).toBe("agr_linked");
  expect(mocks.save).toHaveBeenCalledWith({
    projectRef: "project",
    runId: run.runId,
    explicit: false,
  });
});

it("bounds a moving readiness window", async () => {
  vi.useFakeTimers();
  mocks.read.mockImplementation(async () => ({
    ok: true,
    terminal: false,
    readyAt: new Date(Date.now() + 150000).toISOString(),
    readyInMs: 150000,
    columns: [],
  }));
  const hook = renderHook(() => useModelPlaygroundReport("project", { runId: "run", columns: [] }));
  await act(async () => {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3600000);
  });
  expect(mocks.read).toHaveBeenCalledTimes(3);
  expect(hook.result.current.status).toBe("pending");
  expect(mocks.save).not.toHaveBeenCalled();
  hook.unmount();
  expect(vi.getTimerCount()).toBe(0);
});

it("bounds unknown readiness after six reads", async () => {
  vi.useFakeTimers();
  mocks.read.mockResolvedValue({
    ok: true,
    terminal: false,
    readyAt: null,
    readyInMs: null,
    columns: [],
  });
  const hook = renderHook(() => useModelPlaygroundReport("project", { runId: "run", columns: [] }));
  await act(async () => {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3600000);
  });
  expect(mocks.read).toHaveBeenCalledTimes(6);
  expect(hook.result.current.status).toBe("pending");
  expect(vi.getTimerCount()).toBe(0);
  hook.unmount();
});

it("bounds unchanged future readiness after one follow-up", async () => {
  vi.useFakeTimers();
  mocks.read.mockResolvedValue({
    ok: true,
    terminal: false,
    readyAt: new Date(Date.now() + 150000).toISOString(),
    readyInMs: 100,
    columns: [],
  });
  const hook = renderHook(() => useModelPlaygroundReport("project", { runId: "run", columns: [] }));
  await act(async () => {
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(3600000);
  });
  expect(mocks.read).toHaveBeenCalledTimes(3);
  expect(hook.result.current.status).toBe("pending");
  expect(mocks.save).not.toHaveBeenCalled();
  hook.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
