import { describe, expect, it } from "vitest";
import { MapsResultPendingError, parseMapsResult } from "./maps-result";
import { mapsFixture, mapsResultEnvelope, nativeIds, receiptTime } from "./maps-test-fixtures";

function pending(statusCode: number) {
  const base = mapsResultEnvelope();
  return {
    ...base,
    tasks: [{ ...base.tasks[0], status_code: statusCode, result_count: 0, result: null }],
  };
}
function caught(data: unknown) {
  try {
    parseMapsResult(data, nativeIds[0], mapsFixture().binding, receiptTime);
  } catch (error) {
    return error;
  }
  throw new Error("Expected failure");
}
describe("only documented correlated Maps pending replies permit polling", () => {
  it.each([40601, 40602])("exposes the typed pending code %s", (code) => {
    const error = caught(pending(code));
    expect(error).toBeInstanceOf(MapsResultPendingError);
    expect(error).toMatchObject({ statusCode: code });
  });
  it.each([20000, 20100, 40401, 40403, 50000])(
    "keeps status %s as a hard error when no result exists",
    (code) => {
      expect(caught(pending(code))).not.toBeInstanceOf(MapsResultPendingError);
    },
  );
  it("rejects pending replies for another task, conflicting scope, invalid envelope or malformed result", () => {
    const wrongId = pending(40602);
    wrongId.tasks[0].id = nativeIds[1];
    const wrongScope = pending(40602);
    Object.assign(wrongScope.tasks[0].data, { device: "mobile" });
    const wrongRoot = { ...pending(40602), status_code: 40000 };
    const malformed = { ...pending(40602), tasks: [{ ...pending(40602).tasks[0], result: [] }] };
    for (const reply of [wrongId, wrongScope, wrongRoot, malformed])
      expect(caught(reply)).not.toBeInstanceOf(MapsResultPendingError);
  });
});
