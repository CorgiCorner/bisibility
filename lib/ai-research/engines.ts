export const AI_ENGINES = ["chat_gpt", "claude", "gemini", "perplexity"] as const;
export type AiEngine = (typeof AI_ENGINES)[number];
/** Engine-mode identity frozen onto a hosted execution (ADR-023). */
export type AiResponseExecution = { engine: AiEngine; model: string };

export function isAiEngine(value: string): value is AiEngine {
  return (AI_ENGINES as readonly string[]).includes(value);
}
export function engineResponsePath(engine: AiEngine) {
  return `${engine}/llm_responses/live`;
}
export function engineCatalogPath(engine: AiEngine) {
  return `${engine}/llm_responses/models`;
}
// Perplexity always searches. Response calls accept web_search only; force_web_search is not sent.
export function engineSearchParameters(engine: AiEngine, webSearch: boolean) {
  if (engine === "perplexity") return { web_search: true };
  return { web_search: webSearch };
}
