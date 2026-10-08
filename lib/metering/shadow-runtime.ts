import "server-only";
import { prisma } from "@/lib/db/prisma";
import { meteringNamespace, meteringRuntime, meteringSchema } from "./runtime";
import { shadowRequestContext } from "./shadow-context";
import { createShadowEngine } from "./shadow-engine";
import { createPostgresShadowHandoffs } from "./shadow-handoff";
import { recordImportedShadowEvidence } from "./shadow-import-extension";
import { createPostgresShadowSink } from "./shadow-sink";

const engines = new Map<string, ReturnType<typeof createShadowEngine>>();
export async function shadowForProject(projectId: string, namespace = meteringNamespace()) {
  const context = shadowRequestContext();
  if (!(context?.enabled ?? process.env.METERING_SHADOW === "on")) return null;
  if (!context) return loadProjectShadow(projectId, namespace);
  const key = JSON.stringify([projectId, namespace]);
  let pending = context.projects.get(key);
  if (!pending) {
    pending = loadProjectShadow(projectId, namespace);
    context.projects.set(key, pending);
  }
  return pending;
}
async function loadProjectShadow(projectId: string, namespace: string) {
  try {
    const flag = await prisma.instanceSetting.findUnique({
      where: { key: `metering.shadow.project.${projectId}` },
      select: { value: true },
    });
    if (flag?.value !== "on") return null;
    let engine = engines.get(namespace);
    if (!engine) {
      const runtime = await meteringRuntime();
      const sink = createPostgresShadowSink({ prisma, namespace, schema: meteringSchema() });
      engine = createShadowEngine({
        ...runtime,
        namespace,
        sink: sink.writeComparison,
        importedEvidence: recordImportedShadowEvidence,
        handoffs: createPostgresShadowHandoffs({
          prisma,
          namespace,
          schema: meteringSchema(),
        }),
        async failure(entry, step) {
          console.warn("[metering] shadow step failed", { operationId: entry.id, step });
          await sink.writeFailure({
            ...entry,
            funding: entry.credentialSource === "hosted" ? "platform" : "byok",
          });
        },
      });
      engines.set(namespace, engine);
    }
    return engine;
  } catch {
    console.warn("[metering] shadow unavailable", { projectId });
    return null;
  }
}
