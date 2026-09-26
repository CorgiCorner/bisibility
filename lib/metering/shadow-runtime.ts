import "server-only";
import { prisma } from "@/lib/db/prisma";
import { meteringNamespace, meteringRuntime, meteringSchema } from "./runtime";
import { shadowRequestContext } from "./shadow-context";
import { createShadowEngine } from "./shadow-engine";
import { createPostgresShadowHandoffs } from "./shadow-handoff";
import { writeShadowComparison, writeShadowFailure } from "./shadow-sink";

let engine: ReturnType<typeof createShadowEngine> | undefined;
export async function shadowForProject(projectId: string) {
  const context = shadowRequestContext();
  if (!(context?.enabled ?? process.env.METERING_SHADOW === "on")) return null;
  if (!context) return loadProjectShadow(projectId);
  let pending = context.projects.get(projectId);
  if (!pending) {
    pending = loadProjectShadow(projectId);
    context.projects.set(projectId, pending);
  }
  return pending;
}
async function loadProjectShadow(projectId: string) {
  try {
    const flag = await prisma.instanceSetting.findUnique({
      where: { key: `metering.shadow.project.${projectId}` },
      select: { value: true },
    });
    if (flag?.value !== "on") return null;
    if (!engine) {
      const runtime = await meteringRuntime();
      engine = createShadowEngine({
        ...runtime,
        namespace: meteringNamespace(),
        sink: writeShadowComparison,
        handoffs: createPostgresShadowHandoffs({
          prisma,
          namespace: meteringNamespace(),
          schema: meteringSchema(),
        }),
        async failure(entry, step) {
          console.warn("[metering] shadow step failed", { operationId: entry.id, step });
          await writeShadowFailure({
            ...entry,
            funding: entry.credentialSource === "hosted" ? "platform" : "byok",
          });
        },
      });
    }
    return engine;
  } catch {
    console.warn("[metering] shadow unavailable", { projectId });
    return null;
  }
}
