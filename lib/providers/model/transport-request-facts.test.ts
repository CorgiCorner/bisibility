import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { generateModelResponse } from "./transport";
import {
  assertNoUnexpectedFetch,
  generation,
  interceptedFetch,
  json,
} from "./transport.test-support";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: async () => ({ success: true }),
}));
let fetcher: ReturnType<typeof interceptedFetch>;
beforeEach(() => {
  fetcher = interceptedFetch();
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
});
test("records the actual encoded request for an answer without usage", async () => {
  const input = generation();
  input.column.connectionId = "platform:openrouter";
  input.column.payment = { optionId: "platform:openrouter", fundingSource: "platform" };
  fetcher.mockResolvedValueOnce(json());
  await generateModelResponse(input);
  const call = vi.mocked(input.observer.settle).mock.calls[0];
  expect(call[2]).toMatchObject({
    reason: "unreported",
    requestBytes: Buffer.byteLength(String(fetcher.mock.calls[0][1]?.body)),
  });
});
test.each([400, 401, 403, 429])(
  "preserves HTTP %s as explicit provider rejection",
  async (status) => {
    const input = generation();
    input.column.connectionId = "platform:openrouter";
    input.column.payment = { optionId: "platform:openrouter", fundingSource: "platform" };
    fetcher.mockResolvedValueOnce(json("{}", { status }));
    await expect(generateModelResponse(input)).rejects.toMatchObject({
      httpStatus: status,
      dispatched: true,
    });
    expect(vi.mocked(input.observer.settle).mock.calls[0][2]).toMatchObject({ reason: "rejected" });
  },
);
test("a server failure does not become a measured-zero rejection", async () => {
  const input = generation();
  input.column.connectionId = "platform:openrouter";
  input.column.payment = { optionId: "platform:openrouter", fundingSource: "platform" };
  fetcher.mockResolvedValueOnce(json("{}", { status: 503 }));
  await expect(generateModelResponse(input)).rejects.toMatchObject({ httpStatus: 503 });
  expect(vi.mocked(input.observer.settle).mock.calls[0][2]).toMatchObject({ reason: "unreported" });
});

test("a first admission followed by cancellation records never-called proof before HTTP", async () => {
  const input = generation();
  input.column.connectionId = "platform:openrouter";
  input.column.payment = { optionId: "platform:openrouter", fundingSource: "platform" };
  const controller = new AbortController();
  input.context.signal = controller.signal;
  input.observer.beforeDispatch = vi.fn(async () => {
    controller.abort();
  });
  await expect(generateModelResponse(input)).rejects.toMatchObject({
    code: "aborted",
    dispatched: false,
  });
  expect(fetcher).not.toHaveBeenCalled();
  expect(vi.mocked(input.observer.settle).mock.calls[0][2]).toMatchObject({ reason: "not_called" });
});
