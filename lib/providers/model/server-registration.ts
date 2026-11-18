import "server-only";
import { registerModelProvider } from "./registry";

// Server composition follows instrumentation.ts's lazy registration precedent.
registerModelProvider("openai", () =>
  import("./openai/adapter").then((m) => m.openAIModelProvider),
);
registerModelProvider("anthropic", () =>
  import("./anthropic/adapter").then((m) => m.anthropicModelProvider),
);
registerModelProvider("openrouter", () =>
  import("./openrouter/adapter").then((m) => m.createOpenRouterProvider()),
);
registerModelProvider("vercel_ai_gateway", () =>
  import("./vercel-ai-gateway/adapter").then((m) => m.vercelAiGatewayProvider),
);
