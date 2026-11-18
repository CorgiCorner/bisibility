import { MODEL_PLAYGROUND_LIMITS } from "@/lib/model-playground/schema";
import { collectSources } from "./sources";
import { boundedText, text } from "./text";
import { record } from "./usage";

export function normalizeContent(value: unknown, searchEnabled: boolean, apiKey: string) {
  if (!Array.isArray(value)) throw new Error();
  let answer = "";
  let application = false;
  let toolError = false;
  const calls = new Set<string>();
  const results = new Set<string>();
  const sources = collectSources(apiKey);
  for (const rawBlock of value) {
    const block = record(rawBlock);
    if (!block) throw new Error();
    if (block.type === "text") {
      const value = text(block.text);
      if (value.includes(apiKey)) throw new Error();
      const retained: string = application
        ? ""
        : boundedText(value, MODEL_PLAYGROUND_LIMITS.answerBytes - Buffer.byteLength(answer));
      answer += retained;
      application ||= retained.length !== value.length;
      if (block.citations != null) {
        if (!Array.isArray(block.citations) || (!searchEnabled && block.citations.length > 0))
          throw new Error();
        for (const rawCitation of block.citations) {
          if (record(rawCitation)?.type !== "web_search_result_location") throw new Error();
          sources.addCitation(rawCitation, retained.length === value.length);
        }
      }
    } else if (block.type === "server_tool_use") {
      if (
        !searchEnabled ||
        block.name !== "web_search" ||
        typeof block.id !== "string" ||
        !/^[A-Za-z0-9_-]{1,256}$/.test(block.id) ||
        typeof record(block.input)?.query !== "string" ||
        calls.has(block.id) ||
        (block.caller != null && record(block.caller)?.type !== "direct")
      )
        throw new Error();
      calls.add(block.id);
    } else if (block.type === "web_search_tool_result") {
      if (
        !searchEnabled ||
        typeof block.tool_use_id !== "string" ||
        !calls.has(block.tool_use_id) ||
        results.has(block.tool_use_id)
      )
        throw new Error();
      results.add(block.tool_use_id);
      if (Array.isArray(block.content)) {
        sources.addResults(block.content);
      } else if (record(block.content)?.type === "web_search_tool_result_error") toolError = true;
      else throw new Error();
    } else if (block.type === "thinking") {
      text(block.thinking);
    } else if (block.type === "redacted_thinking") {
      text(block.data);
    } else if (block.type === "tool_use") toolError = true;
    else throw new Error();
  }
  return {
    answer,
    application,
    ...sources.evidence(),
    toolError,
    pendingTool: calls.size !== results.size,
  };
}
