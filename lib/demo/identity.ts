import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  demoIdentityAllowed,
  editableOwnerIdentityAllowed,
  editableViewerIdentityAllowed,
} from "./auth-policy";
import {
  DEMO_ACCOUNT_LOCKED,
  DEMO_IDENTITY_PRESERVED,
  readDemoConfig,
  readOnlyDemoConfig,
} from "./config";
import { isEditableDemoResearchProject } from "./research-storage";

const demoIdentityInclude = {
  memberships: { include: { project: { select: { ownerId: true, publicId: true } } } },
} as const;

async function loadIdentity(publicId: string) {
  return prisma.user.findUnique({ include: demoIdentityInclude, where: { publicId } });
}

export async function loadDemoIdentity() {
  const config = readOnlyDemoConfig();
  if (!config) return null;
  const user = await loadIdentity(config.userPublicId);
  return demoIdentityAllowed(user, config.projectPublicId) ? user : null;
}

export async function loadEditableDemoOwner() {
  const config = readDemoConfig();
  if (config.kind !== "editable") return null;
  const user = await loadIdentity(config.ownerPublicId);
  return editableOwnerIdentityAllowed(user, config.projectPublicId) ? user : null;
}

export async function loadEditableDemoViewer() {
  const config = readDemoConfig();
  if (config.kind !== "editable") return null;
  const user = await loadIdentity(config.viewerPublicId);
  return editableViewerIdentityAllowed(user, config.projectPublicId) ? user : null;
}

export async function loadConfiguredDemoActor(userId: string) {
  const config = readDemoConfig();
  if (config.kind === "disabled") return null;
  if (config.kind === "legacy-read-only") {
    const viewer = await loadDemoIdentity();
    return viewer?.id === userId ? { id: viewer.id, kind: "viewer" as const } : null;
  }
  const owner = await loadEditableDemoOwner();
  if (owner?.id === userId) return { id: owner.id, kind: "owner" as const };
  const viewer = await loadEditableDemoViewer();
  return viewer?.id === userId ? { id: viewer.id, kind: "viewer" as const } : null;
}

export async function assertEditableDemoAccountMutable(userId: string) {
  const config = readDemoConfig();
  if (config.kind === "disabled") return;
  if (config.kind === "legacy-read-only") throw new Error(DEMO_ACCOUNT_LOCKED);
  if ((await loadEditableDemoOwner())?.id !== userId) throw new Error(DEMO_ACCOUNT_LOCKED);
}

export async function assertEditableDemoIdentityPreserved(userId: string) {
  if (await loadConfiguredDemoActor(userId)) throw new Error(DEMO_IDENTITY_PRESERVED);
}

export function assertEditableDemoProjectPreserved(projectPublicId: string) {
  if (isEditableDemoResearchProject(projectPublicId)) throw new Error(DEMO_IDENTITY_PRESERVED);
}
