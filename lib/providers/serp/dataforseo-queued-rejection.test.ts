import type { SerpRankLocation } from "@/lib/serp/location";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataForSeoError, redactedMessage } from "./dataforseo-errors";
import {
  DataForSeoAmbiguousSubmissionError,
  submitDataForSeoQueuedTasks,
} from "./dataforseo-queued";

const credentials = { login: "fake-login@example.test", password: "Fake-Pass-9137" };
const basic = Buffer.from(`${credentials.login}:${credentials.password}`).toString("base64");

function location(): SerpRankLocation {
  return {
    gl: "us",
    hl: "en",
    primaryGeoCode: 2840,
    primaryGeoName: "United States",
    secondaryGeoName: "United States",
  };
}

function task() {
  return {
    attribution: {
      context: {
        correlationId: "correlation_1",
        feature: "rank_check" as const,
        projectId: "project_1",
        source: "worker" as const,
        trigger: "scheduled" as const,
      },
      tag: "app=bisibility;stage=dev;src=worker;trg=scheduled;f=rank_check;p=project_1;c=correlation_1",
    },
    correlationId: "correlation_1",
    depth: 100 as const,
    device: "desktop" as const,
    domain: "example.com",
    keyword: "private keyword",
    location: location(),
    stopOnMatch: true,
  };
}

function submit() {
  return submitDataForSeoQueuedTasks({ credentials, priority: "high", tasks: [task()] });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("queued DataForSEO submission rejections", () => {
  it("keeps the HTTP status, provider status code and redacted status message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            status_code: 40200,
            status_message: `Payment Required for ${credentials.login} (${credentials.password}); Authorization: Basic ${basic}`,
          }),
          { status: 402 },
        ),
      ),
    );

    const error = await submit().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DataForSeoError);
    const rejection = error as DataForSeoError;
    expect(rejection.httpStatus).toBe(402);
    expect(rejection.statusCode).toBe(40200);
    expect(rejection.statusMessage).toContain("Payment Required for [redacted]");
    expect(rejection.message).toMatch(
      /^DataForSEO task submission failed with HTTP 402, status 40200: /,
    );
    for (const text of [rejection.message, rejection.statusMessage ?? ""]) {
      expect(text).not.toContain(credentials.login);
      expect(text).not.toContain(credentials.password);
      expect(text).not.toContain(basic);
    }
  });

  it("bounds a long status message after redaction", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ status_code: 40501, status_message: `x${"y".repeat(400)}` }),
            { status: 400 },
          ),
        ),
    );

    const error = (await submit().catch((caught: unknown) => caught)) as DataForSeoError;

    expect(error.statusMessage).toHaveLength(200);
  });

  it("treats an unreadable 4xx body as a definite rejection, not a lost response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>", { status: 401 })));

    const error = (await submit().catch((caught: unknown) => caught)) as DataForSeoError;

    expect(error).toBeInstanceOf(DataForSeoError);
    expect(error.httpStatus).toBe(401);
    expect(error.statusCode).toBeUndefined();
    expect(error.message).toBe(
      "DataForSEO task submission failed with HTTP 401: no status message.",
    );
  });

  it("keeps the HTTP status of an ambiguous 5xx submission", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));

    const error = await submit().catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DataForSeoAmbiguousSubmissionError);
    expect((error as DataForSeoAmbiguousSubmissionError).httpStatus).toBe(503);
  });

  it("names a failed envelope status on tasks the provider did not answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ status_code: 40100, status_message: "Not authorized.", tasks: [] }),
            { status: 200 },
          ),
        ),
    );

    const result = await submit();

    expect(result.envelope).toEqual({ statusCode: 40100, statusMessage: "Not authorized." });
    expect(result.unknown[0]?.message).toBe(
      "DataForSEO did not return a task result for this correlation (status 40100: Not authorized.).",
    );
  });
});

describe("redactedMessage", () => {
  it("removes credentials, their encoded forms and an echoed Authorization header", () => {
    const text = [
      credentials.login,
      credentials.password,
      encodeURIComponent(credentials.login),
      `${credentials.login}:${credentials.password}`,
      basic,
      'authorization: "Bearer abc.def-123"',
    ].join(" | ");

    const safe = redactedMessage(text, credentials);

    expect(safe).not.toContain(credentials.login);
    expect(safe).not.toContain(credentials.password);
    expect(safe).not.toContain(encodeURIComponent(credentials.login));
    expect(safe).not.toContain(basic);
    expect(safe).not.toContain("abc.def-123");
  });

  it("leaves ordinary provider text untouched", () => {
    expect(redactedMessage("Basic plan limit reached.", credentials)).toBe(
      "Basic plan limit reached.",
    );
  });
});
