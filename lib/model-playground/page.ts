import "server-only";
import type { ProjectScope } from "@/lib/actions/_shared";
import type { ModelCatalogSnapshot } from "@/lib/providers/model/types";
import { getIntegrationCategories } from "@/lib/queries/integrations";
import { modelPlaygroundDefaultCopy } from "./composer-default-copy";
import { applySearchIntent, firstAvailableColumn } from "./composer-state";
import { modelFundingConnections } from "./funding-extension";
import { modelConnectionIdSchema } from "./funding-input";
import { readModelPlayground } from "./read";
import type { ModelPlaygroundRuntime } from "./runtime-contract";

export async function loadNativeModelComposer(
  project: Omit<ProjectScope, "domain">,
  runtime: ModelPlaygroundRuntime,
) {
  const access = await runtime.authorize("read");
  const categories = await getIntegrationCategories(project.publicId);
  const connections = await modelFundingConnections(
    runtime.db,
    project.id,
    access.actorId,
    categories.find((c) => c.id === "model")?.providers ?? [],
  );
  const catalogs: ModelCatalogSnapshot[] = [];
  for (const c of connections) {
    if (!c.connectionId || c.status !== "connected" || !c.enabled) continue;
    const id = c.id;
    if (!["openai", "anthropic", "openrouter", "vercel_ai_gateway"].includes(id)) continue;
    try {
      const resolution = await runtime.resolve(runtime.db, project.id, {
        providerId: id as ModelCatalogSnapshot["providerId"],
        connectionId: modelConnectionIdSchema.parse(c.connectionId),
      });
      catalogs.push(resolution.catalog);
    } catch {
      /* Keep the connection visible; missing catalogs block Run. */
    }
  }
  const first = firstAvailableColumn(catalogs, connections);
  const [latest] = await runtime.db.$transaction(
    (tx) => tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM model_playground_runs WHERE "projectId"=${project.id} AND "actorId"=${access.actorId}
    ORDER BY "createdAt" DESC,id DESC LIMIT 1`,
  );
  const initialRun = latest ? await readModelPlayground(runtime, latest.id) : undefined;
  const input = applySearchIntent(
    { version: 1, prompt: "", responseLanguage: "en", columns: first ? [first] : [] },
    catalogs,
    true,
    "US",
  );
  return {
    enabled: true as const,
    searchByDefault: true,
    connections,
    catalogs,
    input,
    initialRun: initialRun ?? undefined,
    copy: modelPlaygroundDefaultCopy,
    languages: [
      { code: "en", name: "English" },
      { code: "pl", name: "Polish" },
    ],
    markets: [
      { code: "US", name: "United States" },
      { code: "PL", name: "Poland" },
    ],
  };
}
