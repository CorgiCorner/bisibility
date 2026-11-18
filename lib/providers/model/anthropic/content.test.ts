import { expect, it } from "vitest";
import { forbidNetwork, normalized, searchFixture, textFixture } from "./fixtures.test-support";

forbidNetwork();

it("marks title shortening as citation truncation even below the occurrence limit", () => {
  const result = normalized(
    {
      ...textFixture(),
      content: [
        {
          type: "text",
          text: "Answer",
          citations: [
            {
              type: "web_search_result_location",
              url: "https://example.org/",
              title: "a".repeat(513),
            },
          ],
        },
      ],
    },
    true,
  );
  expect(result).toMatchObject({ state: "partial", truncation: { citations: true } });
  expect(result.citations[0].title).toHaveLength(512);
});
it.each(["pending", "orphan", "duplicate", "indirect", "unknown-result", "search-off"])(
  "handles unsafe/incomplete tool evidence %s without hiding measured usage",
  (scenario) => {
    const call = {
      type: "server_tool_use",
      name: "web_search",
      id: "srv1",
      input: { query: "synthetic" },
    };
    const result = { type: "web_search_tool_result", tool_use_id: "srv1", content: [] };
    let content: unknown[] = [call, result, { type: "text", text: "Answer" }];
    if (scenario === "pending") content = [call, { type: "text", text: "Pending" }];
    if (scenario === "orphan") content = [result];
    if (scenario === "duplicate") content = [call, result, result];
    if (scenario === "indirect")
      content = [
        { ...call, caller: { type: "code_execution_20260120", tool_id: "tool1" } },
        result,
      ];
    if (scenario === "unknown-result")
      content = [call, { ...result, content: [{ type: "web_fetch_result" }] }];
    const output = normalized({ ...searchFixture(), content }, scenario !== "search-off");
    expect(output.state).not.toBe("completed");
    expect(output.usage).toMatchObject({ inputTokens: 10, outputTokens: 12, searchCalls: 1 });
    if (scenario === "pending")
      expect(output).toMatchObject({
        state: "partial",
        failure: "provider_error",
        truncation: { provider: true },
      });
    else expect(output).toMatchObject({ state: "failed", failure: "invalid_response" });
  },
);
it("maps server search errors to partial provider failure without dropping usage", () => {
  const output = normalized(
    {
      ...searchFixture(),
      content: [
        { type: "server_tool_use", name: "web_search", id: "srv1", input: { query: "synthetic" } },
        {
          type: "web_search_tool_result",
          tool_use_id: "srv1",
          content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" },
        },
        { type: "text", text: "Partial answer" },
      ],
    },
    true,
  );
  expect(output).toMatchObject({
    state: "partial",
    failure: "provider_error",
    answer: "Partial answer",
    usage: { searchCalls: 1 },
  });
});
