import "server-only";
import { renderAccountDataSourceExtension } from "@/components/settings/AccountDataSourceExtension";
import { readDemoConfig } from "@/lib/demo/config";
import type { ReactNode } from "react";

type ProjectScope = Readonly<{
  actor: { id: string };
  project: { ownerId: string };
}> | null;

export async function renderOnboardingDataSourceExtension(
  children: ReactNode,
  scope: ProjectScope,
) {
  if (readDemoConfig().kind !== "disabled") return children;
  return renderAccountDataSourceExtension(children, {
    // New projects belong to the actor; their client-only step transition keeps this context.
    onboardingOffer: scope === null || scope.actor.id === scope.project.ownerId,
  });
}
