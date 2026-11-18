import { afterEach, expect, test, vi } from "vitest";
import * as admission from "./admission";
import { launchModelPlayground } from "./launch";
import { launchRequest } from "./launch.test-support";
import { isModelPlaygroundLaunchRejection } from "./launch-service";
import type { ModelPlaygroundRuntime } from "./runtime-contract";

const quote = {
  revision: "revision",
  previewId: crypto.randomUUID(),
  quoteToken: "",
  configHash: "a".repeat(64),
};
quote.quoteToken = quote.previewId;
function runtime() {
  return {
    authorize: vi.fn().mockResolvedValue({ actorId: "actor", projectId: "project" }),
    db: { $transaction: vi.fn() },
    resolve: vi.fn(),
  } as unknown as ModelPlaygroundRuntime;
}
afterEach(() => vi.restoreAllMocks());
test("authorization is a typed access refusal before parsing, admission or storage", async () => {
  const r = runtime();
  vi.mocked(r.authorize).mockRejectedValue(new Error("Denied"));
  const admit = vi.spyOn(admission, "admitModelRun");
  expect((await launchModelPlayground(r, null)).kind).toBe("access_denied");
  expect(r.db.$transaction).not.toHaveBeenCalled();
  expect(admit).not.toHaveBeenCalled();
});
// Authorized -> invalid request without admission; only a committed admission can be not_dispatched.
test.each([
  { name: "schema", value: null, reason: "validation_failed", reads: 0 },
  {
    name: "token",
    value: { ...launchRequest(quote), quoteToken: crypto.randomUUID() },
    reason: "validation_failed",
    reads: 0,
  },
  { name: "missing", value: launchRequest(quote), reason: "not_found", reads: 1 },
  {
    name: "foreign actor",
    value: launchRequest(quote),
    reason: "not_found",
    reads: 1,
    context: { actorId: "other", projectId: "project" },
  },
  {
    name: "foreign project",
    value: launchRequest(quote),
    reason: "not_found",
    reads: 1,
    context: { actorId: "actor", projectId: "other" },
  },
])(
  "$name is invalid_request before admission with no writes or dispatch",
  async ({ value, reason, reads, context }) => {
    const r = runtime();
    vi.mocked(r.db.$transaction).mockResolvedValue(context ? { quote: { context } } : null);
    const admit = vi.spyOn(admission, "admitModelRun");
    // Browser and server adapters see exactly the same rejection.
    for (const includeAdmission of [false, true]) {
      const outcome = await launchModelPlayground(r, value, undefined, includeAdmission);
      expect(outcome).toMatchObject({ kind: "invalid_request", reason });
      expect(isModelPlaygroundLaunchRejection(outcome)).toBe(true);
    }
    expect(r.authorize).toHaveBeenCalledWith("create");
    expect(r.db.$transaction).toHaveBeenCalledTimes(reads * 2);
    expect(admit).not.toHaveBeenCalled();
    expect(r.resolve).not.toHaveBeenCalled();
  },
);
