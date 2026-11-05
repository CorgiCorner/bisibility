import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: { oauthClient: { findUnique: vi.fn() } } }));

import {
  compareVersions,
  DSH_PLUGIN_UPDATE_URL,
  dshPluginMinVersion,
  isBelowDshPluginFloor,
  resolveMcpClient,
  UPDATE_REQUIRED_ERROR_CODE,
  updateRequiredResponse,
} from "./client-version-gate";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DSH plugin floor configuration", () => {
  it("is off when unset or blank", () => {
    expect(dshPluginMinVersion(undefined)).toBeNull();
    expect(dshPluginMinVersion("  ")).toBeNull();
  });

  it("accepts an exact X.Y.Z version", () => {
    expect(dshPluginMinVersion(" 0.2.0 ")).toBe("0.2.0");
  });

  it.each(["v0.2.0", "0.2", "0.2.0-rc.1", "latest"])(
    "stays open and warns once for the malformed floor %s",
    (value) => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      expect(dshPluginMinVersion(value)).toBeNull();
      expect(dshPluginMinVersion(value)).toBeNull();
      expect(warn).toHaveBeenCalledTimes(1);
    },
  );
});

describe("version precedence", () => {
  it.each([
    ["0.1.0", "0.2.0", -1],
    ["0.10.0", "0.9.0", 1],
    ["1.0.0", "1.0.0", 0],
    ["0.2.0-rc.1", "0.2.0", -1],
    ["0.2.0", "0.2.0-rc.1", 1],
    ["0.2.0-rc.2", "0.2.0-rc.10", -1],
    ["0.2.0-alpha", "0.2.0-alpha.1", -1],
    ["0.2.0-1", "0.2.0-alpha", -1],
    ["0.2.0+build.5", "0.2.0", 0],
  ])("%s against %s", (left, right, sign) => {
    expect(Math.sign(compareVersions(left, right))).toBe(sign);
  });
});

describe("MCP client identity", () => {
  const legacyName = vi.fn(async () => "DeepSeek Harness");

  it("reads the plugin and its version from the client header", async () => {
    const headers = new Headers({ "X-Bisibility-Client": "bisibility-dsh-plugin/0.2.0" });
    await expect(resolveMcpClient(headers, "client", "0.2.0", legacyName)).resolves.toEqual({
      client: "dsh_plugin",
      inferred: false,
      version: "0.2.0",
    });
    expect(legacyName).not.toHaveBeenCalled();
  });

  it("counts a header-less OAuth client named like plugin 0.1.0 as that version while a floor is set", async () => {
    await expect(resolveMcpClient(new Headers(), "client", "0.2.0", legacyName)).resolves.toEqual({
      client: "dsh_plugin",
      inferred: true,
      version: "0.1.0",
    });
  });

  it("does not look up the OAuth client without a floor", async () => {
    const lookup = vi.fn(async () => "DeepSeek Harness");
    await expect(resolveMcpClient(new Headers(), "client", null, lookup)).resolves.toEqual({
      client: "unknown",
      inferred: false,
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("leaves other header-less callers unknown", async () => {
    const other = vi.fn(async () => "Another MCP client");
    await expect(resolveMcpClient(new Headers(), "client", "0.2.0", other)).resolves.toEqual({
      client: "unknown",
      inferred: false,
    });
    await expect(resolveMcpClient(new Headers(), undefined, "0.2.0", legacyName)).resolves.toEqual({
      client: "unknown",
      inferred: false,
    });
  });
});

describe("DSH plugin floor", () => {
  it.each([
    [{ client: "dsh_plugin", version: "0.1.9", inferred: false }, true],
    [{ client: "dsh_plugin", version: "0.2.0-rc.1", inferred: false }, true],
    [{ client: "dsh_plugin", inferred: false }, true],
    [{ client: "dsh_plugin", version: "0.2.0", inferred: false }, false],
    [{ client: "dsh_plugin", version: "0.3.0", inferred: false }, false],
    [{ client: "mcp", version: "0.0.1", inferred: false }, false],
    [{ client: "unknown", inferred: false }, false],
  ] as const)("refuses %o: %s", (client, refused) => {
    expect(isBelowDshPluginFloor({ ...client }, "0.2.0")).toBe(refused);
  });

  it("never refuses without a floor", () => {
    expect(isBelowDshPluginFloor({ client: "dsh_plugin", inferred: false }, null)).toBe(false);
  });

  it("answers 426 with a JSON-RPC error naming the floor and the market index", async () => {
    const req = new Request("https://example.com/api/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "tools/list" }),
    });
    const response = await updateRequiredResponse(
      req,
      { client: "dsh_plugin", version: "0.1.0", inferred: true },
      "0.2.0",
    );
    expect(response.status).toBe(426);
    expect(response.headers.get("x-bisibility-min-version")).toBe("0.2.0");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({
      jsonrpc: "2.0",
      id: 7,
      error: {
        code: UPDATE_REQUIRED_ERROR_CODE,
        data: { clientVersion: "0.1.0", minVersion: "0.2.0", updateUrl: DSH_PLUGIN_UPDATE_URL },
      },
    });
    expect(body.error.message).toContain("0.2.0 or newer");
  });

  it("uses a null id when the request carries none", async () => {
    const req = new Request("https://example.com/api/mcp", { method: "GET" });
    const response = await updateRequiredResponse(
      req,
      { client: "dsh_plugin", inferred: false },
      "0.2.0",
    );
    expect((await response.json()).id).toBeNull();
  });
});
