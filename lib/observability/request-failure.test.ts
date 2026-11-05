import { APIError } from "better-call";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isTransientRequestFailure,
  reportRequestFailure,
  requestFailureContext,
  safeFailureCauses,
  setRequestFailureMetadata,
  withRequestFailureContext,
} from "./request-failure";
import { redactRequestSecrets } from "./secret-request";

const report = vi.hoisted(() =>
  vi.fn(
    async (
      _message: string,
      _context: { level: string; fingerprint?: string[]; extra: Record<string, unknown> },
    ) => undefined,
  ),
);
vi.mock("./server-message", () => ({ reportServerMessage: report }));

describe("request failure diagnostics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    report.mockClear();
  });

  it("retains neutral phase, cause and HTTP status fields through request scrubbing", async () => {
    vi.stubEnv("SENTRY_DSN", "https://telemetry.example.com/1");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await withRequestFailureContext(new AbortController().signal, async () => {
      setRequestFailureMetadata({ rpcMethod: "tools/list", toolName: "unknown" });
      reportRequestFailure(new APIError("INTERNAL_SERVER_ERROR"), "oauth_verify", 503);
    });
    expect(report).toHaveBeenCalledWith(
      "MCP request failed",
      expect.objectContaining({
        level: "error",
        fingerprint: ["mcp-request", "oauth_verify", "APIError", "unknown", "tools/list"],
        extra: expect.objectContaining({
          phase: "oauth_verify",
          causeClass: "APIError",
          status: 503,
          httpStatus: 503,
        }),
      }),
    );
    const context = report.mock.calls[0]?.[1];
    expect(redactRequestSecrets(context)).toEqual(context);
  });

  it.each([400, 401, 403, 404, 422, 429])(
    "does not report expected HTTP %s at error level",
    async (status) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
      vi.stubEnv("SENTRY_DSN", "https://telemetry.example.com/1");
      await withRequestFailureContext(new AbortController().signal, async () => {
        reportRequestFailure(new Error("expected refusal"), "tool_dispatch", status);
      });
      expect(log).not.toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
    },
  );

  it("does not report client aborts even when the dependency rejects with an ordinary error", async () => {
    const client = new AbortController();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("SENTRY_DSN", "https://telemetry.example.com/1");
    await withRequestFailureContext(client.signal, async () => {
      client.abort();
      reportRequestFailure(new Error("late dependency failure"), "tool_dispatch");
    });
    expect(log).not.toHaveBeenCalled();
    expect(report).not.toHaveBeenCalled();
  });

  it("keeps server timeouts and unknown server errors at error level", async () => {
    vi.stubEnv("SENTRY_DSN", "https://telemetry.example.com/1");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const error of [
      new DOMException("server deadline", "TimeoutError"),
      new TypeError("unknown"),
    ]) {
      await withRequestFailureContext(new AbortController().signal, async () => {
        reportRequestFailure(error, "rate_limit", 503);
      });
    }
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls.every((call) => call[1].level === "error")).toBe(true);
    expect(report.mock.calls[0][1].fingerprint).not.toEqual(report.mock.calls[1][1].fingerprint);
  });

  it("reports an expired server deadline when the client has not cancelled", async () => {
    vi.stubEnv("SENTRY_DSN", "https://telemetry.example.com/1");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await withRequestFailureContext(new AbortController().signal, async () => {
      const context = requestFailureContext();
      if (context) context.signal = AbortSignal.abort();
      reportRequestFailure(new DOMException("deadline", "TimeoutError"), "rate_limit", 503);
    });
    expect(report).toHaveBeenCalledOnce();
  });

  it("does not let an ignored refusal hide a subsequent server failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await withRequestFailureContext(new AbortController().signal, async () => {
      reportRequestFailure(new Error("refusal"), "tool_dispatch", 403);
      reportRequestFailure(new TypeError("server failure"), "response_encode", 500);
    });
    expect(console.error).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(
      "[mcp] request failed",
      expect.objectContaining({
        phase: "response_encode",
        status: 500,
      }),
    );
  });

  it("retains known cause codes and trusted locations without messages, tokens or PII", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cause = Object.assign(new Error("SQL query with test-secret and password"), {
      code: "ECONNREFUSED",
    });
    cause.stack =
      "Error: secret\n at query (/private/owner/lib/api/auth.ts:90:4)\n at token (Bearer secret)";
    const error = Object.assign(
      new Error("person@example.org Authorization: Bearer test-secret", { cause }),
      {
        body: { password: "test-secret" },
        code: "test-secret",
        name: "test-secret",
      },
    );
    await withRequestFailureContext(new AbortController().signal, async () => {
      reportRequestFailure(error, "credential_auth", 503);
      reportRequestFailure(error, "tool_dispatch");
    });
    expect(log).toHaveBeenCalledOnce();
    expect(log.mock.calls[0][1]).toMatchObject({
      phase: "credential_auth",
      status: 503,
      causes: [
        { errorClass: "Error", frames: [] },
        { errorClass: "Error", code: "ECONNREFUSED", frames: ["lib/api/auth.ts:90:4"] },
      ],
    });
    const serialized = JSON.stringify(log.mock.calls);
    for (const secret of [
      "test-secret",
      "secret",
      "person@example.org",
      "postgres://",
      "password",
      "/private/owner",
      "body",
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("does not emit MCP logs for unscoped REST callers", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    reportRequestFailure(new Error("REST failure"));
    expect(log).not.toHaveBeenCalled();
  });

  it("retains only compiled chunk hashes and numeric locations", () => {
    const error = new Error("test-secret");
    error.stack =
      "Error: test-secret\n at privateFunction (/private/person@example.com/.next/server/chunks/ssr/private_abcdef123456.js:4:80)";
    expect(safeFailureCauses(error)).toEqual([
      { errorClass: "Error", frames: ["server-chunk:abcdef123456:4:80"] },
    ]);
    expect(JSON.stringify(safeFailureCauses(error))).not.toContain("private");
    expect(JSON.stringify(safeFailureCauses(error))).not.toContain("example.com");
  });

  it("bounds cyclic and long cause chains", () => {
    const error = new Error("cyclic");
    error.cause = error;
    expect(safeFailureCauses(error)).toHaveLength(1);
    let chain = new Error("root");
    for (let index = 0; index < 10; index++) chain = new Error("parent", { cause: chain });
    expect(safeFailureCauses(chain)).toHaveLength(4);
  });

  it("keeps unrecognized codes and schema errors out of transient classification", () => {
    for (const code of ["P2021", "P2022", "42P01", "private-secret"]) {
      expect(isTransientRequestFailure(Object.assign(new Error("failure"), { code }))).toBe(false);
    }
    expect(
      isTransientRequestFailure(
        new Error("parent", { cause: Object.assign(new Error("failure"), { code: "P2024" }) }),
      ),
    ).toBe(true);
  });

  it("survives hostile error getters and a failing logging sink", async () => {
    const hostile = Object.defineProperty({}, "name", {
      get() {
        throw new Error("private");
      },
    });
    expect(isTransientRequestFailure(hostile)).toBe(false);
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("sink down");
    });
    await expect(
      withRequestFailureContext(new AbortController().signal, async () => {
        reportRequestFailure(hostile);
      }),
    ).resolves.toBeUndefined();
  });
});
