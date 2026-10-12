import { chromium, type Browser, type BrowserType } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import { PlaywrightBrowserProvider } from "@vitest/browser-playwright";
import { attachedOpera, wrapAttachedProvider } from "../../tests/config/vitest.attached-opera";
import {
  assertLocalTestBrowser,
  attachOperaForTests,
  openCdpTransport,
  ownedBrowserContexts,
} from "./attached-opera-playwright.mjs";

function fixture() {
  const personal = { close: vi.fn(), clearCookies: vi.fn() };
  const context = { close: vi.fn(async () => {}), on: vi.fn(), newPage: vi.fn() };
  const raw = {
    close: vi.fn(),
    contexts: vi.fn(() => [personal]),
    newContext: vi.fn(async () => context),
    newPage: vi.fn(),
  };
  const disconnect = vi.fn();
  return {
    personal,
    context,
    raw,
    disconnect,
    owned: ownedBrowserContexts(raw as unknown as Browser, disconnect),
  };
}
const version = {
  Browser: "Chrome/152",
  "User-Agent": "OPR/136",
  webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/browser/id",
};
const fetcher = async () => ({ ok: true, json: async () => version }) as Response;

describe("native library attachment to Opera", () => {
  it("waits for late context cleanup before disconnecting", async () => {
    const f = fixture();
    let created!: (value: typeof f.context) => void;
    let closed!: () => void;
    f.raw.newContext.mockImplementation(
      () =>
        new Promise((resolve) => {
          created = resolve;
        }),
    );
    f.context.close.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          closed = resolve;
        }),
    );
    const creating = f.owned.browser.newContext();
    const rejected = expect(creating).rejects.toThrow("attachment is closed");
    const disposing = f.owned.dispose();
    created(f.context);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(f.context.close).toHaveBeenCalledOnce();
    expect(f.disconnect).not.toHaveBeenCalled();
    closed();
    await rejected;
    await disposing;
    expect(f.disconnect).toHaveBeenCalledOnce();
  });

  it("the real Vitest provider reuses the attached browser without launching", async () => {
    const f = fixture();
    const page = { on: vi.fn(), goto: vi.fn(), close: vi.fn() };
    f.context.newPage.mockResolvedValue(page);
    const project = {
      config: { browser: { name: "chromium", headless: true } },
      browser: { registerCommand: vi.fn() },
      vitest: { config: { inspector: { enabled: false } } },
    };
    const forbidden = ["launch", "launchPersistentContext", "launchServer"].map((method) =>
      vi.spyOn(chromium, method as "launch").mockRejectedValue(new Error("launch forbidden")),
    );
    const delegate = new PlaywrightBrowserProvider(project as any, {});
    const provider = wrapAttachedProvider(delegate, async () => f.owned);
    try {
      await provider.openPage("one", "http://127.0.0.1/", { parallel: false });
      expect(f.raw.newContext).toHaveBeenCalledWith(
        expect.objectContaining({ ignoreHTTPSErrors: true }),
      );
      expect(page.goto).toHaveBeenCalledWith("http://127.0.0.1/", { timeout: 0 });
      expect(delegate.browser).toBe(f.owned.browser);
    } finally {
      await provider.close();
      forbidden.forEach((spy) => {
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
      });
    }
    expect(f.raw.close).not.toHaveBeenCalled();
  });

  it("closes an in-flight owned context before disconnecting during teardown", async () => {
    const f = fixture();
    let finish!: (value: typeof f.context) => void;
    f.raw.newContext.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const creating = f.owned.browser.newContext();
    const rejected = expect(creating).rejects.toThrow("attachment is closed");
    const closing = f.owned.dispose();
    finish(f.context);
    await rejected;
    await closing;
    expect(f.context.close).toHaveBeenCalledOnce();
    expect(f.disconnect).toHaveBeenCalledOnce();
    expect(f.personal.close).not.toHaveBeenCalled();
    expect(f.raw.close).not.toHaveBeenCalled();
  });

  it("still disconnects after owned-context cleanup fails", async () => {
    const f = fixture();
    await f.owned.browser.newContext();
    f.context.close.mockRejectedValue(new Error("owned context unavailable"));
    await expect(f.owned.dispose()).rejects.toThrow("owned context unavailable");
    expect(f.disconnect).toHaveBeenCalledOnce();
    expect(f.personal.close).not.toHaveBeenCalled();
  });

  it("uses only new ephemeral contexts and never exposes or closes the personal context", async () => {
    const f = fixture();
    expect(f.owned.browser.contexts()).toEqual([]);
    const options = { javaScriptEnabled: false, viewport: { width: 1440, height: 1000 } };
    expect(await f.owned.browser.newContext(options)).toBe(f.context);
    expect(f.raw.newContext).toHaveBeenCalledExactlyOnceWith(options);
    expect(f.owned.browser.contexts()).toEqual([f.context]);
    await f.owned.browser.close();
    expect(f.raw.close).not.toHaveBeenCalled();
    await f.owned.dispose();
    expect(f.context.close).toHaveBeenCalledOnce();
    expect(f.personal.close).not.toHaveBeenCalled();
    expect(f.personal.clearCookies).not.toHaveBeenCalled();
    expect(f.raw.contexts).not.toHaveBeenCalled();
    expect(f.disconnect).toHaveBeenCalledOnce();
    await expect(f.owned.browser.newContext()).rejects.toThrow("attachment is closed");
  });

  it("validates identity and disables default context overrides before attaching", async () => {
    const f = fixture();
    const transport = { send: vi.fn(), close: vi.fn() };
    const transportFactory = vi.fn(async () => transport);
    const connect = vi.fn(async () => f.raw as unknown as Browser);
    const attached = await attachOperaForTests({
      fetcher,
      transportFactory,
      connect: connect as BrowserType["connectOverCDP"],
    });
    expect(transportFactory).toHaveBeenCalledExactlyOnceWith(version.webSocketDebuggerUrl);
    expect(connect).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ send: expect.any(Function), close: expect.any(Function) }),
      {
        noDefaults: true,
        timeout: 10_000,
      },
    );
    await attached.dispose();
    expect(transport.close).toHaveBeenCalledOnce();
    expect(f.raw.close).not.toHaveBeenCalled();
  });

  it("rejects missing Opera before transport creation; preserves remote CI", async () => {
    const unavailable = vi.fn(async () => {
      throw new Error("offline");
    });
    const transportFactory = vi.fn();
    await expect(attachOperaForTests({ fetcher: unavailable, transportFactory })).rejects.toThrow(
      "existing Opera",
    );
    expect(transportFactory).not.toHaveBeenCalled();
    await assertLocalTestBrowser({ CI: "true", NODE_ENV: "test" }, unavailable);
    expect(unavailable).toHaveBeenCalledOnce();
    await expect(
      assertLocalTestBrowser({ CI: "false", NODE_ENV: "test" }, unavailable),
    ).rejects.toThrow("existing Opera");
  });

  it("suppresses stock Vitest prewarm and delegates after assigning the owned browser", async () => {
    const f = fixture();
    const page = { keyboard: { press: vi.fn() } };
    const pages = new Map([["one", page]]);
    const delegate = {
      name: "playwright",
      initScripts: ["locators.js"],
      mocker: {},
      browser: null,
      getPage(sessionId: string) {
        expect(this).toBe(delegate);
        const result = pages.get(sessionId);
        if (!result) throw new Error("Unknown test session");
        return result;
      },
      getCommandsContext: vi.fn(),
      getCDPSession: vi.fn(),
      openPage: vi.fn(async () => {
        expect(delegate.browser).toBe(f.owned.browser);
      }),
      close: vi.fn(async () => {}),
    };
    const provider = wrapAttachedProvider(
      delegate as unknown as PlaywrightBrowserProvider,
      async () => f.owned,
    );
    expect(attachedOpera().prewarm).toBeUndefined();
    expect(provider.supportsParallelism).toBe(false);
    await provider.openPage("one", "http://localhost", { parallel: false });
    expect(delegate.openPage).toHaveBeenCalledOnce();
    expect(provider.getPage("one")).toBe(page);
    expect(() => provider.getPage("personal")).toThrow("Unknown test session");
    await provider.close();
    expect(f.disconnect).toHaveBeenCalledOnce();
    await expect(provider.openPage("two", "http://localhost", { parallel: false })).rejects.toThrow(
      "closed",
    );
  });

  it("blocks browser shutdown at the wire and closes only the connection", async () => {
    class Socket extends EventTarget {
      send = vi.fn();
      close = vi.fn();
      constructor(_url: string) {
        super();
        queueMicrotask(() => this.dispatchEvent(new Event("open")));
      }
    }
    const transport = await openCdpTransport(
      version.webSocketDebuggerUrl,
      Socket as unknown as typeof WebSocket,
    );
    expect(() => transport.send({ id: 1, method: "Browser.close" })).toThrow("externally owned");
    expect(() => transport.send({ id: 2, method: "Browser.getVersion" })).not.toThrow();
    transport.close();
  });
});
