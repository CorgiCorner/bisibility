/** Product names shared by one-shot checks and recurring tracking. */
export const AI_ENGINE_LABELS: Readonly<Record<string, string>> = {
  chat_gpt: "ChatGPT",
  google: "Google AI Overviews",
  google_aio: "Google AI Overviews",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
};
export function aiEngineLabel(engine: string) {
  return AI_ENGINE_LABELS[engine] ?? engine;
}
