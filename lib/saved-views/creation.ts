import "server-only";

import { createHash } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { authorizeViewCreate, type ViewScope, type ViewTransaction } from "./access";
import { canonicalSavedViewSelect, type SavedViewVisibility } from "./canonical-model";
import type { ProjectViewConfig } from "./config-model";
import { personalSessionUserId, type SavedViewContext } from "./context";
import { privateViewCreationCapability } from "./creation-extension";
import {
  PrivateViewCreationUnavailableError,
  SavedViewConflictError,
  SavedViewUnavailableError,
} from "./errors";

export const MAX_SAVED_VIEWS_PER_SCOPE = 50;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("Saved-view input must be JSON data.");
  return serialized;
}

export function savedViewCreationHash(input: {
  config: ProjectViewConfig;
  name: string;
  projectId: string;
  visibility: SavedViewVisibility;
}) {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

export async function createViewInTransaction(
  tx: ViewTransaction,
  scope: ViewScope,
  context: SavedViewContext,
  input: {
    config: ProjectViewConfig;
    name: string;
    visibility: SavedViewVisibility;
    requestId?: string;
  },
) {
  authorizeViewCreate(scope, context, input.visibility);
  if (input.visibility === "private" && !privateViewCreationCapability().canCreatePrivate)
    throw new PrivateViewCreationUnavailableError();
  const userId = input.requestId ? personalSessionUserId(context) : null;
  const ownerId = input.visibility === "private" ? personalSessionUserId(context) : null;
  const inputHash = savedViewCreationHash({
    config: input.config,
    name: input.name,
    projectId: scope.project.publicId,
    visibility: input.visibility,
  });
  // Shared quota is serialized across all users; private quota is isolated per owner.
  const lock = JSON.stringify([
    "saved-view-create",
    scope.project.id,
    input.config.surface,
    ownerId,
  ]);
  await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended(${lock},0))`;
  if (userId && input.requestId) {
    const requestLock = JSON.stringify([
      "saved-view-request",
      scope.project.id,
      userId,
      input.requestId,
    ]);
    await tx.$queryRaw`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended(${requestLock},0))`;
    const receipt = await tx.savedViewCreationRequest.findUnique({
      where: {
        userId_projectId_requestId: {
          userId,
          projectId: scope.project.id,
          requestId: input.requestId,
        },
      },
    });
    if (receipt) {
      if (receipt.inputHash !== inputHash) throw new SavedViewConflictError();
      if (!receipt.savedViewId) throw new SavedViewUnavailableError();
      const view = await tx.savedView.findFirst({
        select: canonicalSavedViewSelect,
        where: {
          id: receipt.savedViewId,
          projectId: scope.project.id,
          publicId: receipt.savedViewPublicId,
        },
      });
      if (!view || view.visibility !== input.visibility || view.ownerId !== ownerId)
        throw new SavedViewUnavailableError();
      return { replayed: true, view };
    }
  }
  const count = await tx.savedView.count({
    where: {
      ownerId,
      projectId: scope.project.id,
      surface: input.config.surface,
      visibility: input.visibility,
    },
  });
  if (count >= MAX_SAVED_VIEWS_PER_SCOPE)
    throw new SavedViewConflictError("This saved-view scope is full.");
  const view = await tx.savedView.create({
    data: {
      config: input.config as Prisma.InputJsonValue,
      createdById: context.auditActorId,
      name: input.name,
      ownerId,
      projectId: scope.project.id,
      publicId: makePublicId("viw"),
      revision: 1,
      surface: input.config.surface,
      visibility: input.visibility,
    },
    select: canonicalSavedViewSelect,
  });
  if (userId && input.requestId) {
    await tx.savedViewCreationRequest.create({
      data: {
        inputHash,
        projectId: scope.project.id,
        requestId: input.requestId,
        savedViewId: view.id,
        savedViewPublicId: view.publicId,
        userId,
      },
    });
  }
  return { replayed: false, view };
}
