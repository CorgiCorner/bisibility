import { beforeEach, describe, expect, it, vi } from "vitest";

async function loadModule() {
  vi.resetModules();
  return import("./error-reporting");
}

describe("error reporting seam", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("does nothing and does not throw when no sink is registered", async () => {
    const { reportAppError } = await loadModule();

    expect(() => reportAppError(new Error("boom"), { pathname: "/app" })).not.toThrow();
  });

  it("replays errors buffered before the sink registered", async () => {
    const { registerErrorReportSink, reportAppError } = await loadModule();
    const sink = vi.fn();

    reportAppError(new Error("first"), { digest: "abc", pathname: "/app" });
    registerErrorReportSink(sink);

    expect(sink).toHaveBeenCalledOnce();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ message: "first" }), {
      digest: "abc",
      pathname: "/app",
    });
  });

  it("forwards later errors straight to the sink", async () => {
    const { registerErrorReportSink, reportAppError } = await loadModule();
    const sink = vi.fn();

    registerErrorReportSink(sink);
    reportAppError(new Error("later"));

    expect(sink).toHaveBeenCalledOnce();
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ message: "later" }), {});
  });

  it("bounds the buffer so a page without a sink cannot grow it forever", async () => {
    const { registerErrorReportSink, reportAppError } = await loadModule();
    const sink = vi.fn();

    for (let index = 0; index < 50; index += 1) {
      reportAppError(new Error(`error ${index}`));
    }
    registerErrorReportSink(sink);

    expect(sink).toHaveBeenCalledTimes(10);
  });
});
