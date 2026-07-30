import "server-only";

import {
  assertMigrationTokenMintRateLimit,
  mintMigrationTokenForProject,
  revokeMigrationTokenForProject,
} from "@/lib/migration/token-service";
import { getCloudImportView } from "@/lib/queries/cloud";
import { z } from "zod";
import type { ApiContext } from "./context";
import { listResponse, resourceResponse } from "./responses";
import {
  objectBody,
  parseApiInput,
  readJsonBody,
  runDomain,
  scopedProject,
  snakeizeKeys,
} from "./surface";

const mintTokenSchema = z.object({
  projectId: z.string().trim().min(1).max(160),
  scope: z.enum(["full", "keywords"]).default("full"),
});

function migrationActorId(ctx: ApiContext) {
  const actorId = ctx.actorId ?? ctx.auth.project.ownerId;
  if (!actorId) {
    throw new Error("Migration token actor could not be resolved.");
  }
  return actorId;
}

export async function listMigrationTokens(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const view = await runDomain(() => getCloudImportView(projectId));
  const tokens = view.activeToken ? [view.activeToken] : [];

  return listResponse(tokens.map(snakeizeKeys), null, {
    headers: ctx.headers,
    meta: snakeizeKeys({ importJob: view.importJob }) as Record<string, unknown>,
  });
}

export async function mintProjectMigrationToken(ctx: ApiContext, projectId: string) {
  const scoped = scopedProject(ctx, projectId);
  if (scoped) return scoped;

  const body = await readJsonBody(ctx);
  const input = parseApiInput(mintTokenSchema, {
    ...objectBody(body),
    project_id: projectId,
  });
  const actorId = migrationActorId(ctx);
  await runDomain(() => assertMigrationTokenMintRateLimit(ctx.actorId ?? ctx.auth.apiKey.id));
  const token = await runDomain(() =>
    mintMigrationTokenForProject({
      action: "migration_token.mint",
      actorId,
      projectId: ctx.auth.project.id,
      scope: input.scope,
    }),
  );

  return resourceResponse(snakeizeKeys(token), { headers: ctx.headers, status: 201 });
}

export async function revokeProjectMigrationToken(
  ctx: ApiContext,
  tokenId: string,
  projectId?: string,
) {
  if (projectId) {
    const scoped = scopedProject(ctx, projectId);
    if (scoped) return scoped;
  }

  const result = await runDomain(() =>
    revokeMigrationTokenForProject({
      actorId: migrationActorId(ctx),
      projectId: ctx.auth.project.id,
      tokenId,
    }),
  );

  return resourceResponse(snakeizeKeys(result), { headers: ctx.headers });
}
