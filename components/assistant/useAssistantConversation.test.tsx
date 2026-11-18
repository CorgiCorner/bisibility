import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useAssistantConversation } from "./useAssistantConversation";

describe("assistant stop", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("posts stop and aborts the active stream", async () => {
    let signal: AbortSignal | undefined;
    let abortedWhenStopPosted: boolean | undefined;
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ seq: 1, type: "run.started", conversationId: "c", assistantMessageId: "m", userMessage: null, run: { id: "r", status: "streaming", modelId: "m", provider: "openai", funding: "byok", startedAt: "2026-01-01", finishedAt: null, error: null, usage: null } })}\n`,
          ),
        );
      },
    });
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/turns")) {
        signal = init?.signal as AbortSignal;
        return { ok: true, body };
      }
      if (url.endsWith("/stop")) abortedWhenStopPosted = signal?.aborted;
      return { ok: true };
    });
    vi.stubGlobal("fetch", fetchMock);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAssistantConversation("prj_1", false), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    act(() => result.current.send("hello", null, "m"));
    await waitFor(() => expect(result.current.current?.activeRunId).toBe("r"));
    act(() => result.current.stop());
    await waitFor(() => expect(signal?.aborted).toBe(true));
    // The server records the Stop before the stream drops, so it is not mistaken for a disconnect.
    expect(abortedWhenStopPosted).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("/api/assistant/runs/r/stop", { method: "POST" });
  });
  it("reuses the request ID when resubmitting a network failure", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        requests.push(String(init?.body));
        throw new Error("offline");
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAssistantConversation("prj_1", false), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    act(() => result.current.send("hello", null, "m"));
    await waitFor(() => expect(result.current.networkError).toBe(true));
    act(() => result.current.resubmit());
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(JSON.parse(requests[1]).requestId).toBe(JSON.parse(requests[0]).requestId);
  });
  it("sends the chosen token limit with the turn and none for the model maximum", async () => {
    const requests: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        requests.push(String(init?.body));
        throw new Error("offline");
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAssistantConversation("prj_1", false), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    act(() => result.current.send("hello", null, "m", "low", 4096));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(JSON.parse(requests[0])).toMatchObject({ effort: "low", maxOutputTokens: 4096 });
    act(() => result.current.send("again", null, "m", null, null));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(JSON.parse(requests[1])).not.toHaveProperty("maxOutputTokens");
  });
  it("reloads the funding view when a run reaches a terminal state", async () => {
    const urls: string[] = [];
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        if (String(url).endsWith("/turns")) {
          return new Response(
            new ReadableStream({
              start(controller) {
                const run = {
                  id: "r",
                  status: "completed",
                  modelId: "m",
                  provider: "openai",
                  funding: "credits",
                  startedAt: "2026-01-01",
                  finishedAt: "2026-01-01",
                  error: null,
                  usage: null,
                };
                const started = {
                  seq: 1,
                  type: "run.started",
                  conversationId: "c",
                  assistantMessageId: "m",
                  userMessage: null,
                  run: { ...run, status: "streaming", finishedAt: null },
                };
                controller.enqueue(encoder.encode(`${JSON.stringify(started)}\n`));
                controller.enqueue(
                  encoder.encode(`${JSON.stringify({ seq: 2, type: "run.finished", run })}\n`),
                );
                controller.close();
              },
            }),
            { status: 200, headers: { "content-type": "application/x-ndjson" } },
          );
        }
        return new Response("[]", { status: 200 });
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAssistantConversation("prj_1", true), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    await waitFor(() => expect(urls.some((url) => url.includes("/config"))).toBe(true));
    const before = urls.filter((url) => url.includes("/config")).length;
    act(() => result.current.send("hello", null, "m"));
    await waitFor(() =>
      expect(urls.filter((url) => url.includes("/config")).length).toBeGreaterThan(before),
    );
  });
  it("re-reads the stopped run until its charge settles, then reloads the balance", async () => {
    const urls: string[] = [];
    let conversationReads = 0;
    let stopPosted = false;
    const encoder = new TextEncoder();
    const run = {
      id: "r",
      status: "streaming",
      modelId: "m",
      provider: "openai",
      funding: "credits",
      startedAt: "2026-01-01",
      finishedAt: null,
      error: null,
      usage: null,
      usageUncertain: true,
    };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const started = {
          seq: 1,
          type: "run.started",
          conversationId: "c",
          assistantMessageId: "m",
          userMessage: null,
          run,
        };
        controller.enqueue(encoder.encode(`${JSON.stringify(started)}\n`));
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(String(url));
        if (String(url).endsWith("/turns"))
          return new Response(body, {
            status: 200,
            headers: { "content-type": "application/x-ndjson" },
          });
        if (String(url).endsWith("/stop")) stopPosted = true;
        if (String(url).includes("/conversations/")) {
          if (stopPosted) conversationReads++;
          // The charge lands on the server a moment after Stop: unsettled on the first read.
          const settled = conversationReads > 1;
          return Response.json({
            id: "c",
            projectPublicId: "prj_1",
            title: null,
            messages: [],
            activeRunId: null,
            runs: [{ ...run, status: "cancelled", usageUncertain: !settled }],
          });
        }
        return Response.json(String(url).includes("/config") ? {} : []);
      }),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useAssistantConversation("prj_1", true), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });
    act(() => result.current.send("hello", null, "m"));
    await waitFor(() => expect(result.current.current?.activeRunId).toBe("r"));
    const configBefore = urls.filter((url) => url.includes("/config")).length;
    act(() => result.current.stop());
    await waitFor(() => expect(conversationReads).toBeGreaterThanOrEqual(2), { timeout: 4000 });
    // Once for the Stop itself, again after the charge settled.
    await waitFor(() =>
      expect(urls.filter((url) => url.includes("/config")).length).toBeGreaterThanOrEqual(
        configBefore + 2,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 1500));
    // Settled on the second read: it stops asking.
    expect(conversationReads).toBe(2);
  });
});
