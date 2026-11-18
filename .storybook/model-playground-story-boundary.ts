import { fileURLToPath } from "node:url";

const actions = fileURLToPath(new URL("./model-playground-action-stubs.ts", import.meta.url));
const history = fileURLToPath(new URL("./research-history-stubs.ts", import.meta.url));
export const modelPlaygroundStoryBoundaries = {
  "@/lib/actions/ai-tracking": fileURLToPath(
    new URL("./ai-tracking-action-stubs.ts", import.meta.url),
  ),
  "@/lib/actions/model-playground": actions,
  "@/lib/actions/model-playground-track": actions,
  "@/lib/actions/research-history": history,
  "@/lib/actions/research-history-pins": history,
};

export function resolveModelPlaygroundStoryBoundary(source: string, importer?: string) {
  if (
    source === "@/lib/actions/ai-tracking" &&
    importer?.includes("/components/ai-research/ModelPlaygroundResults")
  )
    return actions;
  const clean = source.split("?")[0].replaceAll("\\", "/");
  for (const [name, path] of Object.entries(modelPlaygroundStoryBoundaries)) {
    if (clean === name || clean.endsWith(`${name.slice(1)}.ts`)) return path;
  }
  return null;
}
