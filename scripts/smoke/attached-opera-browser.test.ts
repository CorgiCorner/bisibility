import { mkdtemp, rm, writeFile, mkdir, symlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import { assertOperaEndpoint } from "./attached-opera-browser.mjs";
import {
  createVisualBrowser,
  isMainModule,
  runVisualSmoke,
  selectStories,
  verifyVisualPng,
} from "./smoke-visual.mjs";

const version = {
  Browser: "Chrome/152.0.7977.120",
  "User-Agent": "Mozilla/5.0 Chrome/152.0.7977.120 OPR/136.0.0.0",
  webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/browser/owned-browser",
};
const response = (data = version) => ({ ok: true, json: async () => data }) as Response;

describe("attached visual smoke", () => {
  it("recognizes a symlinked entry path and still executes its main flow", async () => {
    const dir = await mkdtemp(join(tmpdir(), "visual-entry-"));
    try {
      const real = join(dir, "real");
      await mkdir(real);
      const script = join(real, "entry.mjs");
      const helper = new URL("./smoke-visual.mjs", import.meta.url).href;
      await writeFile(
        script,
        `import { isMainModule } from ${JSON.stringify(helper)}; if (isMainModule(import.meta.url)) console.log("ran");`,
      );
      await symlink(real, join(dir, "link"), "dir");
      expect(
        execFileSync(process.execPath, [join(dir, "link/entry.mjs")], { encoding: "utf8" }).trim(),
      ).toBe("ran");
      expect(isMainModule(pathToFileURL(script).href, join(dir, "link/entry.mjs"))).toBe(true);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it("rejects device-scale screenshots instead of silently accepting double-width PNGs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "visual-png-test-"));
    try {
      const file = join(dir, "page.png");
      const header = Buffer.alloc(33);
      Buffer.from("89504e470d0a1a0a", "hex").copy(header);
      header.writeUInt32BE(2880, 16);
      header.writeUInt32BE(1600, 20);
      await writeFile(file, header);
      await expect(verifyVisualPng(file)).rejects.toThrow("device scale 1");
      await expect(verifyVisualPng(file, 2880)).resolves.toBeUndefined();
      header.writeUInt32BE(1440, 16);
      await writeFile(file, header);
      await expect(verifyVisualPng(file)).resolves.toBeUndefined();
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  it.each([
    { ...version, "User-Agent": "Chrome/152.0.0.0" },
    {
      ...version,
      // Deliberately rejected endpoint: this test asserts no browser or build starts.
      // nosemgrep: javascript.lang.security.detect-insecure-websocket.detect-insecure-websocket
      webSocketDebuggerUrl: "ws://remote.example:9222/devtools/browser/id",
    },
    { ...version, webSocketDebuggerUrl: "ws://127.0.0.1:9333/devtools/browser/id" },
    { ...version, webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/id" },
  ])("rejects unverified CDP before any browser work or build", async (data) => {
    const browser = {
      preflight: () => assertOperaEndpoint(async () => response(data)).then(() => {}),
      open: vi.fn(),
      capture: vi.fn(),
      dispose: vi.fn(),
    };
    const prepare = vi.fn();
    const serve = vi.fn();
    await expect(runVisualSmoke({ browser, prepare, serve })).rejects.toThrow("existing Opera");
    expect(browser.open).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(serve).not.toHaveBeenCalled();
  });

  it("uses a fresh context with DPR1 and retains native full-page screenshot semantics", async () => {
    const page = {
      goto: vi.fn(),
      screenshot: vi.fn(),
      evaluate: vi.fn(async () => ({ scale: 1, width: 1800 })),
    };
    const context = { newPage: vi.fn(async () => page) };
    const newContext = vi.fn(async () => context);
    const dispose = vi.fn();
    const browser = createVisualBrowser({ NODE_ENV: "test" }, async () => ({
      browser: { newContext } as unknown as Browser,
      dispose,
    }));
    await browser.open();
    expect(
      await browser.capture(
        "http://127.0.0.1:4321/iframe.html?id=one&viewMode=story",
        "/tmp/one.png",
      ),
    ).toBe(1800);
    await browser.dispose();
    expect(newContext).toHaveBeenCalledExactlyOnceWith({
      viewport: { height: 1000, width: 1440 },
      deviceScaleFactor: 1,
    });
    expect(page.goto).toHaveBeenCalledWith(
      "http://127.0.0.1:4321/iframe.html?id=one&viewMode=story",
      { waitUntil: "networkidle" },
    );
    expect(page.screenshot).toHaveBeenCalledWith({ fullPage: true, path: "/tmp/one.png" });
    page.evaluate.mockResolvedValue({ scale: 2, width: 1800 });
    await expect(browser.capture("http://127.0.0.1/", "/tmp/two.png")).rejects.toThrow(
      "device scale 1",
    );
    expect(page.screenshot).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it.each([
    { offsetWidth: 1425, hasBody: true },
    { offsetWidth: 1500, hasBody: true },
    { offsetWidth: 1425, hasBody: false },
  ])(
    "matches native dimensions for $offsetWidth CSS pixels and body=$hasBody",
    async ({ offsetWidth, hasBody }) => {
      vi.stubGlobal("devicePixelRatio", 1);
      vi.stubGlobal("innerWidth", 1440);
      vi.stubGlobal("document", {
        body: hasBody ? { scrollWidth: 1425, clientWidth: 1425, offsetWidth } : null,
        documentElement: { scrollWidth: 1425, clientWidth: 1425, offsetWidth },
      });
      try {
        const page = {
          goto: vi.fn(),
          screenshot: vi.fn(),
          evaluate: vi.fn(async (fn: () => unknown) => fn()),
        };
        const browser = createVisualBrowser({ NODE_ENV: "test" }, async () => ({
          browser: {
            newContext: async () => ({ newPage: async () => page }),
          } as unknown as Browser,
          dispose: vi.fn(),
        }));
        await browser.open();
        expect(await browser.capture("http://local/", "/tmp/dimensions.png")).toBe(offsetWidth);
      } finally {
        vi.unstubAllGlobals();
      }
    },
  );

  it("retains the eight selected IDs, filenames and captures", async () => {
    const titles = [
      "Other",
      "Shell/App",
      "Docs/Guide",
      "Settings/Usage",
      "Onboarding/Wizard",
      "Integrations/IntegrationCategory",
      "Keywords/Workspace",
      "Overview/KpiCard",
      "Landing/Hero",
      "Other2",
    ];
    const selected = selectStories(
      titles.map((title, index) => ({ id: `story-${index}`, title, name: "Default" })),
    );
    expect(selected.map((s) => s.id)).toEqual([
      "story-8",
      "story-7",
      "story-6",
      "story-5",
      "story-4",
      "story-3",
      "story-2",
      "story-1",
    ]);
    const browser = { preflight: vi.fn(), open: vi.fn(), capture: vi.fn(), dispose: vi.fn() };
    const close = vi.fn();
    await runVisualSmoke({
      browser,
      prepare: async () => selected,
      serve: async () => ({ port: 4321, server: { close } }),
      log: vi.fn(),
      verify: vi.fn(),
    });
    expect(browser.capture.mock.calls.map(([, file]) => file.split("/").at(-1))).toEqual(
      selected.map((s) => `${s.id}.png`),
    );
    expect(browser.dispose).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it("cleans up the context and server after screenshot failure", async () => {
    const browser = {
      preflight: vi.fn(),
      open: vi.fn(),
      capture: vi.fn(async () => {
        throw new Error("capture failed");
      }),
      dispose: vi.fn(),
    };
    const close = vi.fn();
    await expect(
      runVisualSmoke({
        browser,
        prepare: async () => [{ id: "one" }],
        serve: async () => ({ port: 4321, server: { close } }),
      }),
    ).rejects.toThrow("capture failed");
    expect(browser.dispose).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
});
